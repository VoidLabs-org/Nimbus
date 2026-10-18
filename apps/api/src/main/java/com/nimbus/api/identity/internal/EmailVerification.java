package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.UUID;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Proves a User owns their email with a Verification code: 6 digits, valid for 15 minutes, one live code per User
 * (a new one replaces the old), cancelled after 5 wrong tries. Only a keyed hash of the code is stored. The code
 * is mailed through {@link Mailer} directly, after the transaction that stored it has committed, and never goes
 * into a domain event: events are stored, so the code would sit in the database in plain text.
 */
@Service
class EmailVerification {

	private static final Logger log = LoggerFactory.getLogger(EmailVerification.class);

	private final UserRepository users;

	private final Mailer mailer;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final TransactionTemplate transaction;

	private final EmailedCodes codes;

	private final EmailSendBudget sendBudget;

	private final MailAssets mailAssets;

	EmailVerification(UserRepository users, EmailedCodeKinds codeKinds, Mailer mailer, Clock clock,
			ApplicationEventPublisher events, PlatformTransactionManager transactionManager,
			EmailSendBudget sendBudget, MailAssets mailAssets) {
		this.sendBudget = sendBudget;
		this.mailAssets = mailAssets;
		this.users = users;
		this.mailer = mailer;
		this.clock = clock;
		this.events = events;
		this.transaction = new TransactionTemplate(transactionManager);
		this.codes = codeKinds.verification();
	}

	/**
	 * Issues a code for a User who has just registered and mails it. Registration has already succeeded, so
	 * nothing that goes wrong here is allowed to undo it: the failure is logged, and the User can ask for
	 * another code.
	 */
	void issueAfterSignUp(User user) {
		try {
			// Over the budget (the address was mailed a moment ago): the code is still issued, so a Resend later
			// works, but it is not mailed.
			var mail = spendOrSkip(user.email());
			issueAndSend(user, mail);
		}
		catch (RuntimeException e) {
			log.warn("Could not send a Verification code to user {}", user.getId(), e);
		}
	}

	private boolean spendOrSkip(String email) {
		try {
			sendBudget.spend(email);
			return true;
		}
		catch (SlidingWindowLimiter.LimitExceededException e) {
			log.info("Not mailing a Verification code: this address was mailed too recently or too often");
			return false;
		}
	}

	/**
	 * Replaces the signed-in User's code with a new one and mails it. The old code stops working only once the
	 * send is allowed: a refused resend leaves it alone.
	 *
	 * @throws AlreadyVerifiedException when the email is already verified
	 * @throws SlidingWindowLimiter.LimitExceededException when the address was mailed too recently or too often
	 */
	void resend(UUID userId) {
		var user = users.findById(userId).orElseThrow(
				() -> new InvalidBearerTokenException("The User for this token no longer exists"));
		if (user.emailVerified()) {
			throw new AlreadyVerifiedException();
		}
		sendBudget.spend(user.email());
		issueAndSend(user, true);
	}

	private void issueAndSend(User user, boolean mail) {
		var code = transaction.execute(status -> {
			// The User's row serialises everything that changes their code.
			users.findLockedById(user.getId()).orElseThrow();
			return codes.issue(user.getId());
		});
		if (mail) {
			try {
				mailer.send(VerificationMail.to(user.email(), code, EmailedCodes.LIFETIME,
						mailAssets.url(MailAssets.NIMBUS_ICON_DARK)));
			}
			catch (RuntimeException e) {
				// Fire and forget, as the mail module promises: the User asks for another code when none arrives.
				log.warn("Could not send a Verification code to user {}", user.getId(), e);
			}
		}
	}

	/**
	 * Marks the User's email verified when {@code code} is right, and publishes {@link EmailVerified}. A User who
	 * is already verified is left alone. A wrong try is counted even though it fails, so the counting is committed
	 * before the failure is reported.
	 *
	 * @throws EmailedCodes.WrongCodeException when the code is wrong and tries are left
	 * @throws EmailedCodes.CodeExpiredException when there is no live code: expired, never issued, or cancelled, which the
	 * fifth wrong try itself does
	 */
	User verify(UUID userId, String code) {
		var outcome = transaction.execute(status -> {
			var locked = users.findLockedById(userId).orElseThrow(
					() -> new InvalidBearerTokenException("The User for this token no longer exists"));
			if (locked.emailVerified()) {
				return new Outcome(locked, EmailedCodes.Check.RIGHT);
			}
			var check = codes.check(userId, code);
			if (check.isRight()) {
				locked.verifyEmail();
				events.publishEvent(new EmailVerified(locked.getId(), locked.email()));
			}
			return new Outcome(locked, check);
		});
		// Thrown only now: throwing inside the transaction would roll back the count of a wrong try.
		if (!outcome.check().isRight()) {
			throw outcome.check().failure();
		}
		return outcome.user();
	}

	private record Outcome(User user, EmailedCodes.Check check) {
	}

	/** The email is already verified, so there is nothing to send a code for. */
	static class AlreadyVerifiedException extends RuntimeException {

		AlreadyVerifiedException() {
			super("This email is already verified");
		}

	}

}
