package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Locale;

import com.nimbus.api.identity.UserRegistered;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Creates Users who sign up with email and password, and announces each one with {@link UserRegistered}. */
@Service
class Registration {

	private final UserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final TransactionTemplate transaction;

	private final EmailVerification verification;

	private final SlidingWindowLimiter attemptsByAddress;

	Registration(UserRepository users, PasswordEncoder passwordEncoder, AuthProperties properties, Clock clock,
			ApplicationEventPublisher events, PlatformTransactionManager transactionManager,
			EmailVerification verification) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
		this.events = events;
		this.verification = verification;
		this.transaction = new TransactionTemplate(transactionManager);
		this.attemptsByAddress = new SlidingWindowLimiter(properties.registrationsPerAddress(),
				properties.limitWindow(), clock);
	}

	/**
	 * @param fromAddress the caller's IP address; each address gets a limited number of attempts
	 */
	User register(String displayName, String email, String password, String fromAddress) {
		attemptsByAddress.acquire(fromAddress, "Too many sign-ups from this network. Try again later.");
		return create(displayName, email, password);
	}

	/**
	 * Creates a User and publishes {@link UserRegistered}, whoever asked for it (a visitor or the admin seed).
	 * Hashing the password is slow, so it happens outside any transaction and must not hold a database
	 * connection; only the insert and the event share one. The unique constraint, not the up-front check, is
	 * what guarantees one User per email.
	 */
	User create(String displayName, String email, String password) {
		return create(displayName, email, password, false);
	}

	/** Like {@link #create} for a User whose email the operator vouches for, so it counts as verified. */
	User createVerified(String displayName, String email, String password) {
		return create(displayName, email, password, true);
	}

	private User create(String displayName, String email, String password, boolean verified) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		if (users.existsByEmail(normalizedEmail)) {
			throw new EmailAlreadyRegisteredException();
		}
		var hash = passwordEncoder.encode(password);
		var now = clock.instant();
		var user = verified ? User.verifiedWithPassword(normalizedEmail, displayName, hash, now)
				: User.withPassword(normalizedEmail, displayName, hash, now);
		try {
			var saved = transaction.execute(status -> {
				var created = users.saveAndFlush(user);
				events.publishEvent(new UserRegistered(created.getId(), created.email(), created.displayName()));
				return created;
			});
			if (!verified) {
				// After the commit, and never able to undo the sign-up.
				verification.issueAfterSignUp(saved);
			}
			return saved;
		}
		catch (DataIntegrityViolationException e) {
			// Another request registered the same email between the check and the insert.
			if (violates(e, "users_email_key")) {
				throw new EmailAlreadyRegisteredException();
			}
			throw e;
		}
	}

	// The reported name may be schema-qualified or quoted, e.g. "public.users_email_key".
	static boolean violates(DataIntegrityViolationException e, String constraint) {
		return e.getCause() instanceof ConstraintViolationException violation
				&& violation.getConstraintName() != null
				&& violation.getConstraintName().toLowerCase(Locale.ROOT).contains(constraint);
	}

	static class EmailAlreadyRegisteredException extends RuntimeException {

		EmailAlreadyRegisteredException() {
			super("This email is already registered");
		}

	}

}
