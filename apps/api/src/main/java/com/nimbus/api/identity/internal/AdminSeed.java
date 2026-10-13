package com.nimbus.api.identity.internal;

import jakarta.validation.Validator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Creates a deployment's first admin User from {@code NIMBUS_ADMIN_EMAIL} and {@code NIMBUS_ADMIN_PASSWORD},
 * so it doesn't go to whoever registers the admin email first. Does nothing unless both are set, and nothing
 * if a User already has that email, so restarts never create a duplicate. The email counts as verified: the
 * operator who set it owns it, so continuing with a provider never removes the admin's password. The User is announced with
 * {@code UserRegistered} like any other; what that means for access is up to the modules that listen.
 */
@Component
class AdminSeed implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(AdminSeed.class);

	private static final String DISPLAY_NAME = "Admin";

	private final Registration registration;

	private final Validator validator;

	private final String email;

	private final String password;

	AdminSeed(Registration registration, Validator validator, @Value("${nimbus.admin.email:}") String email,
			@Value("${nimbus.admin.password:}") String password) {
		this.registration = registration;
		this.validator = validator;
		this.email = email.strip();
		this.password = password;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (email.isEmpty() || password.isEmpty()) {
			return;
		}
		// The same rules as registration, not a copy of them: a mistyped email or a weak password should stop
		// startup, not ship. The messages never repeat the password.
		if (!validator.validateValue(AuthController.RegisterRequest.class, "email", email).isEmpty()) {
			throw new IllegalStateException("NIMBUS_ADMIN_EMAIL is not a valid email address (at most "
					+ ValidEmail.MAX_LENGTH + " characters)");
		}
		if (!validator.validateValue(AuthController.RegisterRequest.class, "password", password).isEmpty()) {
			throw new IllegalStateException("NIMBUS_ADMIN_PASSWORD must be " + ValidPassword.MIN_LENGTH + " to "
					+ ValidPassword.MAX_LENGTH + " characters");
		}
		try {
			registration.createVerified(DISPLAY_NAME, email, password);
			log.info("Created the admin User {}", email);
		}
		catch (Registration.EmailAlreadyRegisteredException e) {
			log.info("Admin seed skipped: {} already exists", email);
		}
	}

}
