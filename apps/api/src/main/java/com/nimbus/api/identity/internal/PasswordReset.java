package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Locale;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.annotation.PreDestroy;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Forgot password: a Reset code emailed to the address lets whoever reads it set a new password. Reading the email
 * proves they own the address, so a right code also verifies it. A request answers the same, as fast, for every
 * email, so it never says whether an email is registered. The reset step can: a wrong code for a registered
 * email answers {@code invalid_code}, while an unknown email always fails like an expired code. That is
 * accepted, because registering already answers {@code 409} for a registered email. Reset codes follow the rules of {@link EmailedCodes} and are kept apart from Verification codes, so a
 * pending code of one kind never replaces the other.
 */
@Service
class PasswordReset {

	private static final Logger log = LoggerFactory.getLogger(PasswordReset.class);

	private final UserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final Sessions sessions;

	private final SignIn signIn;

	private final Mailer mailer;

	private final MailAssets mailAssets;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final TransactionTemplate transaction;

	private final EmailedCodes verificationCodes;

	/**
	 * Its own small pool with a bounded queue, not the application's shared one: this work is triggered by
	 * anyone without signing in, so a flood must neither grow a queue without bound nor starve other modules'
	 * async work. When it is full the request is dropped and logged. Not a bean, because a bean of type
	 * {@code Executor} would switch off Spring Boot's own.
	 */
	private final ThreadPoolExecutor background = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
			new ArrayBlockingQueue<>(100), runnable -> {
				var thread = new Thread(runnable, "password-reset");
				thread.setDaemon(true);
				return thread;
			});

	private final EmailedCodes codes;

	PasswordReset(UserRepository users, EmailedCodeKinds codeKinds, PasswordEncoder passwordEncoder, Sessions sessions,
			SignIn signIn, Mailer mailer, MailAssets mailAssets, Clock clock, ApplicationEventPublisher events,
			PlatformTransactionManager transactionManager) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.sessions = sessions;
		this.signIn = signIn;
		this.mailer = mailer;
		this.mailAssets = mailAssets;
		this.clock = clock;
		this.events = events;
		this.transaction = new TransactionTemplate(transactionManager);
		this.verificationCodes = codeKinds.verification();
		this.codes = codeKinds.reset();
	}

	@PreDestroy
	void stop() {
		background.shutdown();
	}

	/**
	 * Issues a Reset code for the User with {@code email}, replacing any live one, and mails it. Everything,
	 * including finding out whether such a User exists, happens after this returns, on a background thread, so
	 * the caller's wait is the same for every email. Failures are logged, never reported.
	 */
	void request(String email) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		try {
			background.execute(() -> issueAndSend(normalizedEmail));
		}
		catch (RuntimeException e) {
			log.warn("Could not start issuing a Reset code", e);
		}
	}

	private void issueAndSend(String email) {
		var user = users.findByEmail(email).orElse(null);
		if (user == null) {
			return;
		}
		try {
			var code = transaction.execute(status -> {
				// The User's row serialises everything that changes their code.
				users.findLockedById(user.getId()).orElseThrow();
				return codes.issue(user.getId());
			});
			// After the commit, and never in an event: events are stored, so the code would sit in the database.
			mailer.send(ResetMail.to(user.email(), code, EmailedCodes.LIFETIME,
					mailAssets.url(MailAssets.NIMBUS_ICON_DARK)));
		}
		catch (RuntimeException e) {
			log.warn("Could not send a Reset code to user {}", user.getId(), e);
		}
	}

	/**
	 * Sets the password of the User with {@code email} when {@code code} is their live Reset code. The code is
	 * used up, the email becomes verified (publishing {@link EmailVerified} if it wasn't), every session of the
	 * User ends and their failed sign-ins are forgotten. The User is not signed in. A wrong try is counted even
	 * though it fails, so the counting is committed before the failure is reported.
	 *
	 * @param newPassword already checked against the password rule
	 * @throws EmailedCodes.WrongCodeException when the code is wrong and tries are left
	 * @throws EmailedCodes.CodeExpiredException when there is no live code (expired, never issued, or cancelled,
	 * which the fifth wrong try itself does) or no User has this email
	 */
	void reset(String email, String code, String newPassword) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		// Slow, so outside any transaction, and done for every request, so an unknown email takes as long as a
		// known one.
		var passwordHash = passwordEncoder.encode(newPassword);
		var check = transaction.execute(status -> {
			var user = users.findLockedByEmail(normalizedEmail).orElse(null);
			if (user == null) {
				return EmailedCodes.Check.NONE;
			}
			var checked = codes.check(user.getId(), code);
			if (checked.isRight()) {
				user.changePassword(passwordHash);
				if (!user.emailVerified()) {
					user.verifyEmail();
					// As entering it would: a pending Verification code has nothing left to prove.
					verificationCodes.discard(user.getId());
					events.publishEvent(new EmailVerified(user.getId(), user.email()));
				}
				sessions.endAll(user);
			}
			return checked;
		});
		// Thrown only now: throwing inside the transaction would roll back the count of a wrong try.
		if (!check.isRight()) {
			throw check.failure();
		}
		signIn.clearFailures(normalizedEmail);
	}

}
