package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Locale;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

	@Transactional
	User register(String displayName, String email, String password) {
		var normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
		if (users.existsByEmail(normalizedEmail)) {
			throw new EmailAlreadyRegisteredException();
		}
		var user = User.withPassword(normalizedEmail, displayName.trim(), passwordEncoder.encode(password),
				clock.instant());
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

	private static boolean violates(DataIntegrityViolationException e, String constraint) {
		return e.getCause() instanceof ConstraintViolationException violation
				&& constraint.equals(violation.getConstraintName());
	}

	static class EmailAlreadyRegisteredException extends RuntimeException {

		EmailAlreadyRegisteredException() {
			super("This email is already registered");
		}

	}

}
