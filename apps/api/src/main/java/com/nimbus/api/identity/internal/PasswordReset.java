package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Locale;
import java.util.concurrent.Executor;

import javax.crypto.SecretKey;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Forgot password: a Reset code emailed to the address lets whoever reads it set a new password. Reading the email
 * proves they own the address, so a right code also verifies it. Nothing here says whether an email is registered:
 * a request answers the same, as fast, for every email, and a reset for an unknown email fails like an expired
 * code. Reset codes follow the rules of {@link EmailedCodes} and are kept apart from Verification codes, so a
 * pending code of one kind never replaces the other.
 */
@Service
class PasswordReset {

	private static final Logger log = LoggerFactory.getLogger(PasswordReset.class);

	private final UserRepository users;

	private final ResetCodeRepository codes;

	private final PasswordEncoder passwordEncoder;

	private final Sessions sessions;

	private final SignIn signIn;

	private final Mailer mailer;

	private final MailAssets mailAssets;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final TransactionTemplate transaction;

	private final Executor background;

	private final EmailedCodes hashing;

	PasswordReset(UserRepository users, ResetCodeRepository codes, PasswordEncoder passwordEncoder, Sessions sessions,
			SignIn signIn, Mailer mailer, MailAssets mailAssets, Clock clock, ApplicationEventPublisher events,
			PlatformTransactionManager transactionManager, SecretKey jwtKey,
			@Qualifier("applicationTaskExecutor") Executor background) {
		this.users = users;
		this.codes = codes;
		this.passwordEncoder = passwordEncoder;
		this.sessions = sessions;
		this.signIn = signIn;
		this.mailer = mailer;
		this.mailAssets = mailAssets;
		this.clock = clock;
		this.events = events;
		this.transaction = new TransactionTemplate(transactionManager);
		this.background = background;
		this.hashing = new EmailedCodes(jwtKey, "nimbus:reset-code");
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
			var code = EmailedCodes.newCode();
			var hash = hashing.hash(user.getId(), code);
			var now = EmailedCodes.issuedAt(clock);
			transaction.executeWithoutResult(status -> {
				// The User's row serialises everything that changes their code.
				users.findLockedById(user.getId()).orElseThrow();
				var existing = codes.findLockedByUserId(user.getId());
				if (existing.isPresent()) {
					existing.get().replaceWith(hash, now, now.plus(EmailedCodes.LIFETIME));
				}
				else {
					codes.save(new ResetCode(user.getId(), hash, now, now.plus(EmailedCodes.LIFETIME)));
				}
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
		var triesLeft = transaction.execute(status -> {
			var user = users.findLockedByEmail(normalizedEmail).orElse(null);
			if (user == null) {
				return -1;
			}
			var stored = codes.findLockedByUserId(user.getId()).orElse(null);
			if (stored == null || stored.isExpiredAt(clock.instant())) {
				return -1;
			}
			if (EmailedCodes.matches(stored.codeHash(), hashing.hash(user.getId(), code))) {
				codes.delete(stored);
				user.changePassword(passwordHash);
				if (!user.emailVerified()) {
					user.verifyEmail();
					events.publishEvent(new EmailVerified(user.getId(), user.email()));
				}
				sessions.endAll(user);
				return 0;
			}
			stored.countWrongTry();
			var left = EmailedCodes.MAX_WRONG_TRIES - stored.wrongTries();
			if (left <= 0) {
				codes.delete(stored);
				return -1;
			}
			return left;
		});
		if (triesLeft == 0) {
			signIn.clearFailures(normalizedEmail);
			return;
		}
		if (triesLeft < 0) {
			throw new EmailedCodes.CodeExpiredException();
		}
		throw new EmailedCodes.WrongCodeException(triesLeft);
	}

}
