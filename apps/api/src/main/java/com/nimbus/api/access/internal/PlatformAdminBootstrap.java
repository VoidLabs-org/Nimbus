package com.nimbus.api.access.internal;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import com.nimbus.api.identity.UserRegistered;
import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Makes the User with {@code NIMBUS_ADMIN_EMAIL} Platform admin, when they register and at every startup, but only
 * once their email is verified (the seeded admin, or someone who proved the address through Google or GitHub).
 * Otherwise someone who registered the admin's email first with a password would take over Nimbus.
 */
@Component
class PlatformAdminBootstrap {

	private static final Logger log = LoggerFactory.getLogger(PlatformAdminBootstrap.class);

	private final Users users;

	private final JdbcClient jdbc;

	private final String adminEmail;

	PlatformAdminBootstrap(Users users, JdbcClient jdbc, @Value("${nimbus.admin.email:}") String adminEmail) {
		this.users = users;
		this.jdbc = jdbc;
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
		var added = jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT :id, r.id, :user, NULL, :now FROM access_roles r WHERE r.key = 'platform_admin'
				ON CONFLICT (user_id, role_id) WHERE project_id IS NULL DO NOTHING""")
			.param("id", UUID.randomUUID())
			.param("user", user.id())
			.param("now", java.sql.Timestamp.from(Instant.now()))
			.update();
		if (added > 0) {
			log.info("Made {} Platform admin", user.email());
		}
	}

}
