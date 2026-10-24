package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.identity.RecoveryCodeUsed;
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

	private final EmailSendBudget sendBudget;

	private final SlidingWindowLimiter requestsByAddress;

	private final SlidingWindowLimiter resetsByAddress;

	private final TwoStepStore twoStep;

	private final SignInCodeCheck secondCodes;

	private final RememberedBrowsers rememberedBrowsers;

	PasswordReset(UserRepository users, EmailedCodeKinds codeKinds, PasswordEncoder passwordEncoder, Sessions sessions,
			SignIn signIn, Mailer mailer, MailAssets mailAssets, Clock clock, ApplicationEventPublisher events,
			PlatformTransactionManager transactionManager, AuthProperties properties, EmailSendBudget sendBudget,
			TwoStepStore twoStep, SignInCodeCheck secondCodes,
			RememberedBrowsers rememberedBrowsers) {
		this.rememberedBrowsers = rememberedBrowsers;
		this.twoStep = twoStep;
		this.secondCodes = secondCodes;
		this.sendBudget = sendBudget;
		this.requestsByAddress = new SlidingWindowLimiter(properties.passwordResetRequestsPerAddress(),
				properties.limitWindow(), clock);
		this.resetsByAddress = new SlidingWindowLimiter(properties.passwordResetsPerAddress(),
				properties.limitWindow(), clock);
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
	 * <p>
	 * What is checked before returning is the same for every email too: the caller's IP address, then the send
	 * budget of the address typed, which is spent whether or not a User has it, so a refusal never says whether
	 * one does.
	 *
	 * @param fromAddress the caller's IP address; each address gets a limited number of requests
	 * @throws SlidingWindowLimiter.LimitExceededException when the IP address asked too often or the email was
	 * mailed too recently or too often; nothing is issued or sent then, and a live code is left alone
	 */
	void request(String email, String fromAddress) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		var slot = requestsByAddress.acquire(fromAddress,
				"Too many password reset requests from this network. Try again later.");
		try {
			sendBudget.spend(normalizedEmail);
		}
		catch (SlidingWindowLimiter.LimitExceededException e) {
			// Nothing was sent, so it must not use up the network's allowance (an office shares one address).
			requestsByAddress.release(fromAddress, slot);
			throw e;
		}
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
	 * <p>
	 * A User with Two-step verification also needs a Sign-in code or a Recovery code (ADR 0005), so someone with only
	 * their inbox can't change the password or end their Sessions. It is asked for only once the Reset code is right,
	 * so nothing says whether a User has it before then, and a missing or wrong second code changes nothing. Two-step
	 * verification stays on.
	 *
	 * @param newPassword already checked against the password rule
	 * @param twoStepCode a Sign-in code; ignored when {@code recoveryCode} is given
	 * @param recoveryCode a Recovery code, compared with capitals, spaces and dashes ignored; null or blank for a
	 * Sign-in code
	 * @param fromAddress the caller's IP address; each address gets a limited number of attempts
	 * @throws SlidingWindowLimiter.LimitExceededException when this IP address tried too often, or the User got too
	 * many second codes wrong in the last hour
	 * @throws EmailedCodes.WrongCodeException when the code is wrong and tries are left
	 * @throws EmailedCodes.CodeExpiredException when there is no live code (expired, never issued, or cancelled,
	 * which the fifth wrong try itself does) or no User has this email
	 * @throws TwoStepRequiredException when the User has Two-step verification and no second code came
	 * @throws WrongTwoStepCodeException when the second code is wrong (a Recovery code also when it was used)
	 */
	void reset(String email, String code, String newPassword, String twoStepCode, String recoveryCode,
			String fromAddress) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		// Counted for every request, two_step_required too: each one costs a password hash and the User's row lock.
		resetsByAddress.acquire(fromAddress, "Too many password reset attempts from this network. Try again later.");
		// Slow, so outside any transaction, and done for every request, so an unknown email takes as long as a
		// known one.
		var passwordHash = passwordEncoder.encode(newPassword);
		var failure = transaction.execute(status -> {
			var user = users.findLockedByEmail(normalizedEmail).orElse(null);
			if (user == null) {
				return EmailedCodes.Check.NONE.failure();
			}
			var checked = codes.check(user.getId(), code);
			if (!checked.isRight()) {
				return checked.failure();
			}
			var secondCodeFailure = checkSecondCode(user, twoStepCode, recoveryCode);
			if (secondCodeFailure != null) {
				// Rolled back, so the Reset code is not used up and keeps its tries. A wrong second code still counts
				// toward the User's hourly lock, which is kept outside the database.
				status.setRollbackOnly();
				return secondCodeFailure;
			}
			user.changePassword(passwordHash, clock.instant());
			if (!user.emailVerified()) {
				user.verifyEmail();
				// As entering it would: a pending Verification code has nothing left to prove.
				verificationCodes.discard(user.getId());
				events.publishEvent(new EmailVerified(user.getId(), user.email()));
			}
			sessions.endAll(user);
			rememberedBrowsers.forgetAll(user.getId());
			return null;
		});
		// Thrown only now: throwing inside the transaction would roll back the count of a wrong try.
		if (failure != null) {
			throw failure;
		}
		signIn.clearFailures(normalizedEmail);
	}

	/**
	 * The second code a User with Two-step verification needs; nothing for a User without it. A right Recovery code
	 * is used up and publishes {@link RecoveryCodeUsed}.
	 *
	 * @return why the reset can't go ahead; null when it can
	 * @throws SlidingWindowLimiter.LimitExceededException when the User got too many codes wrong in the last hour
	 */
	private RuntimeException checkSecondCode(User user, String twoStepCode, String recoveryCode) {
		var authenticator = twoStep.find(user.getId()).orElse(null);
		if (authenticator == null) {
			return null;
		}
		if (!SignInCodeCheck.isRecoveryCode(recoveryCode) && (twoStepCode == null || twoStepCode.isBlank())) {
			return new TwoStepRequiredException();
		}
		// Postgres keeps microseconds, so the time is cut to them before it is stored and announced.
		var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		var answer = secondCodes.useEither(user.getId(), authenticator, twoStepCode, recoveryCode, now);
		if (!answer.right()) {
			return new WrongTwoStepCodeException(answer.recoveryCode());
		}
		if (answer.usedRecoveryCode()) {
			events.publishEvent(new RecoveryCodeUsed(user.getId(), now, answer.recoveryCodesLeft()));
		}
		return null;
	}

	/** Becomes a 400 with {@code code: two_step_required}: the Reset code was right, and a second code must follow. */
	static class TwoStepRequiredException extends RuntimeException {

		TwoStepRequiredException() {
			super("Enter the code from your authenticator app, or a recovery code.");
		}

	}

	/** Becomes a 400 with {@code code: invalid_two_step_code}; the Reset code is left as it was. */
	static class WrongTwoStepCodeException extends RuntimeException {

		/** @param recoveryCode whether the wrong code was a Recovery code, which the message names */
		WrongTwoStepCodeException(boolean recoveryCode) {
			super(recoveryCode ? "That recovery code isn't right, or it was used already."
					: "That code didn't work. Check your authenticator app and try again.");
		}

	}

}
