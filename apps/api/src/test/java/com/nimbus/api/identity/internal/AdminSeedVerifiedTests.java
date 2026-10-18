package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/** The operator who configured the admin email owns it, so no provider sign-in may take the admin's password away. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@TestPropertySource(properties = { "nimbus.admin.email=owner@example.com", "nimbus.admin.password=seeded password" })
class AdminSeedVerifiedTests {

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	SignIn signIn;

	@Test
	void continuingWithAProviderKeepsTheSeededAdminsPassword() {
		var admin = externalSignIn.signIn(new ExternalProfile("google", "g-owner", "owner@example.com", true, "Owner", null, "owner@example.com"));

		assertThat(admin.emailVerified()).isTrue();
		assertThat(signIn.signIn("owner@example.com", "seeded password", "client-owner").getId())
			.isEqualTo(admin.getId());
	}

}
