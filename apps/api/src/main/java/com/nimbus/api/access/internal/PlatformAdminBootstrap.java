package com.nimbus.api.access.internal;

import java.util.Locale;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.identity.UserRegistered;
import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Makes the User with {@code NIMBUS_ADMIN_EMAIL} Platform admin when they register, when their email becomes
 * verified, and at every startup, but only once their email is verified (the seeded admin, or someone who proved the address through Google or GitHub).
 * Otherwise someone who registered the admin's email first with a password would take over Nimbus.
 */
@Component
class PlatformAdminBootstrap {

	private static final Logger log = LoggerFactory.getLogger(PlatformAdminBootstrap.class);

	private final Users users;

	private final String adminEmail;

	private final PlatformRoleHolders holders;

	PlatformAdminBootstrap(Users users, PlatformRoleHolders holders,
			@Value("${nimbus.admin.email:}") String adminEmail) {
		this.users = users;
		this.holders = holders;
		this.adminEmail = adminEmail.strip().toLowerCase(Locale.ROOT);
	}

	// Synchronous, right after the registration commits: the admin holds Platform admin by the time the
	// registration (or the admin seed at startup) returns.
	@TransactionalEventListener
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	void on(UserRegistered event) {
		if (!adminEmail.isEmpty() && adminEmail.equals(event.email())) {
			users.findByEmail(adminEmail).ifPresent(this::grantIfVerified);
		}
	}

	// The real owner of the admin email claimed it with Google or GitHub, after someone registered it with a
	// password: they become Platform admin straight away, not at the next restart.
	@TransactionalEventListener
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	void on(EmailVerified event) {
		if (!adminEmail.isEmpty() && adminEmail.equals(event.email())) {
			users.findByEmail(adminEmail).ifPresent(this::grantIfVerified);
		}
	}

	void atStartup() {
		if (!adminEmail.isEmpty()) {
			users.findByEmail(adminEmail).ifPresent(this::grantIfVerified);
		}
	}

	private void grantIfVerified(UserSummary user) {
		if (!user.emailVerified()) {
			log.warn("NIMBUS_ADMIN_EMAIL is {}, but that User has not verified the email, so they are not made "
					+ "Platform admin. Signing in once with Google or GitHub on that email verifies it.", user.email());
			return;
		}
		if (holders.makePlatformAdmin(user)) {
			log.info("Made {} Platform admin", user.email());
		}
	}

}
