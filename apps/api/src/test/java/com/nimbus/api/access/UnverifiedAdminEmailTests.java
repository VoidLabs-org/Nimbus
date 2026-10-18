package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Someone registers the admin email with a password before the operator seeds it. A password sign-up never proves
 * the email, so they must not become Platform admin.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=Boss@Example.com", "nimbus.admin.password=" })
class UnverifiedAdminEmailTests {

	@Autowired
	RestTestClient client;

	@Test
	void aPasswordSignUpOnTheAdminEmailGetsNoAdminRights() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Mallory", "email", "boss@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");

		client.get().uri("/api/access/roles")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isForbidden();
		client.get().uri("/api/access/me/permissions")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isForbidden();
	}

}
