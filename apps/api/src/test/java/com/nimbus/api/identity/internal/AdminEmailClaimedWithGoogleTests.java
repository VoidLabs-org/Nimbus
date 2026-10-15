package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.access.PlatformPermissions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/**
 * Someone registers the admin email with a password, so they get no admin rights. Then the real owner signs in
 * with Google on that email, which proves the address: they become Platform admin at once, without a restart.
 * Lives here because only identity's sign-in entry point can stand in for the Google round trip.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@TestPropertySource(properties = { "nimbus.admin.email=owner@example.com", "nimbus.admin.password=" })
class AdminEmailClaimedWithGoogleTests {

	@Autowired
	Registration registration;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	PlatformPermissions permissions;

	@Test
	void theRealOwnerBecomesPlatformAdminTheMomentGoogleVerifiesTheEmail() {
		var squatted = registration.create("Mallory", "owner@example.com", "squatter pass");
		assertThat(permissions.holds(squatted.getId(), "access:role:manage")).isFalse();

		externalSignIn.signIn(new ExternalProfile("google", "g-owner", "owner@example.com", true, "Owner", null));

		assertThat(permissions.holds(squatted.getId(), "access:role:manage")).isTrue();
	}

}
