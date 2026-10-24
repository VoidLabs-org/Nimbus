package com.nimbus.api.identity.internal;

import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Changes a verified User's email. A Verification code is mailed to the new address, and the email changes only
 * when it is entered, so a typo can't lock anyone out. One pending change per User: asking again replaces it and
 * its code. Nothing but the email changes: Sessions, the password, Two-step verification and Linked identities
 * stay as they are.
 */
@Service
class EmailChange {

	private static final Logger log = LoggerFactory.getLogger(EmailChange.class);

	private final UserRepository users;

	private final Sessions sessions;

	private final EmailedCodes codes;

	private final EmailSendBudget sendBudget;

	private final Mailer mailer;

	private final MailAssets mailAssets;

	private final TransactionTemplate transaction;

	private final Duration recentSignIn;

	EmailChange(UserRepository users, Sessions sessions, EmailedCodeKinds codeKinds, EmailSendBudget sendBudget,
			Mailer mailer, MailAssets mailAssets, PlatformTransactionManager transactionManager,
			AuthProperties properties) {
		this.users = users;
		this.sessions = sessions;
		this.codes = codeKinds.emailChange();
		this.sendBudget = sendBudget;
		this.mailer = mailer;
		this.mailAssets = mailAssets;
		this.transaction = new TransactionTemplate(transactionManager);
		this.recentSignIn = properties.linkRecentSignIn();
	}

	/**
	 * Mails a code to {@code newEmail}, replacing any pending change. Needs a Session that started recently, as
	 * connecting a provider does: a stolen access token alone must not move the account to another inbox. A pending
	 * change doesn't hold the address; {@link #confirm} checks it again.
	 *
	 * @throws Sessions.ReauthRequiredException when the Session started too long ago
	 * @throws SameEmailException when it is already the User's email
	 * @throws EmailTakenException when another User has it
	 * @throws SlidingWindowLimiter.LimitExceededException when the new address was mailed too recently or too often;
	 * nothing is issued then, and a pending change is left alone
	 */
	void request(UUID userId, UUID sessionId, String newEmail) {
		var email = newEmail.toLowerCase(Locale.ROOT);
		sessions.requireStartedWithin(sessionId, userId, recentSignIn);
		var user = users.require(userId);
		if (user.email().equals(email)) {
			throw new SameEmailException();
		}
		if (users.existsByEmail(email)) {
			throw new EmailTakenException();
		}
		sendBudget.spend(email);
		var code = transaction.execute(status -> {
			// The User's row serialises everything that changes their codes and their email.
			users.findLockedById(userId).orElseThrow();
			return codes.issue(userId, email);
		});
		try {
			mailer.send(EmailChangeMail.to(email, code, EmailedCodes.LIFETIME,
					mailAssets.url(MailAssets.NIMBUS_ICON_DARK)));
		}
		catch (RuntimeException e) {
			// Fire and forget, as the mail module promises: the User asks for another code when none arrives.
			log.warn("Could not send an email change code for user {}", userId, e);
		}
	}

	/**
	 * Changes the email to the pending address when {@code code} is right. A wrong try is counted even though it
	 * fails, so the counting is committed before the failure is reported.
	 *
	 * @throws EmailedCodes.WrongCodeException when the code is wrong and tries are left
	 * @throws EmailedCodes.CodeExpiredException when no change is pending: expired, never asked for, or cancelled
	 * by the fifth wrong try
	 * @throws EmailTakenException when another User took the address since the code was sent; the code still works
	 * for another try
	 */
	User confirm(UUID userId, String code) {
		Outcome outcome;
		try {
			outcome = transaction.execute(status -> {
				var user = users.findLockedById(userId).orElseThrow(
						() -> new InvalidBearerTokenException("The User for this token no longer exists"));
				var newEmail = codes.newEmail(userId);
				var check = codes.check(userId, code);
				if (!check.isRight()) {
					return new Outcome(user, check, false);
				}
				if (users.existsByEmail(newEmail.orElseThrow())) {
					// Keep the code: nothing about it was wrong.
					status.setRollbackOnly();
					return new Outcome(user, check, true);
				}
				user.changeEmail(newEmail.get());
				// Flushed here, so a User who took the address a moment ago fails this transaction, not the next.
				users.saveAndFlush(user);
				return new Outcome(user, check, false);
			});
		}
		catch (DataIntegrityViolationException e) {
			if (Registration.violates(e, "users_email_key")) {
				throw new EmailTakenException();
			}
			throw e;
		}
		// Thrown only now: throwing inside the transaction would roll back the count of a wrong try.
		if (outcome.taken()) {
			throw new EmailTakenException();
		}
		if (!outcome.check().isRight()) {
			throw outcome.check().failure();
		}
		return outcome.user();
	}

	private record Outcome(User user, EmailedCodes.Check check, boolean taken) {
	}

	static class SameEmailException extends RuntimeException {

		SameEmailException() {
			super("That's already your email");
		}

	}

	static class EmailTakenException extends RuntimeException {

		EmailTakenException() {
			super("That email is already used by another Nimbus account");
		}

	}

}
