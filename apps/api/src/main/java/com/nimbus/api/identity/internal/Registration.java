package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Locale;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** Creates Users who sign up with email and password. */
@Service
class Registration {

	private final UserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final Clock clock;

	Registration(UserRepository users, PasswordEncoder passwordEncoder, Clock clock) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
	}

	/**
	 * Deliberately not one transaction: Argon2 hashing is slow and must not hold a database connection.
	 * The unique constraint, not the up-front check, is what guarantees one User per email.
	 */
	User register(String displayName, String email, String password) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		if (users.existsByEmail(normalizedEmail)) {
			throw new EmailAlreadyRegisteredException();
		}
		var user = User.withPassword(normalizedEmail, displayName, passwordEncoder.encode(password), clock.instant());
		try {
			return users.saveAndFlush(user);
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
	private static boolean violates(DataIntegrityViolationException e, String constraint) {
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
