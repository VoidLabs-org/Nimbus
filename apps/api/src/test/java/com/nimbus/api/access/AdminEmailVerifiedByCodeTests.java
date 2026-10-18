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
 * The person who owns the admin email registers it with a password, then proves it by entering the code emailed to
 * them: they become Platform admin the moment the email is verified. A class of its own: it needs its own admin
 * email, and so its own database.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=Owner@Example.com", "nimbus.admin.password="})
class AdminEmailVerifiedByCodeTests {

	@Autowired
	RestTestClient client;

	@Test
	void theRealOwnerBecomesPlatformAdminAfterEnteringTheEmailedCode() throws InterruptedException {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Owner", "email", "owner@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");

		EmailCodes.verify(client, token, "owner@example.com");

		// The grant follows the EmailVerified event, which access handles after the commit.
		var deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
		int status;
		do {
			status = client.get().uri("/api/access/roles").header("Authorization", "Bearer " + token)
				.exchange().returnResult(String.class).getStatus().value();
			if (status != 200) {
				Thread.sleep(100);
			}
		}
		while (status != 200 && System.nanoTime() < deadline);
		assertThat(status).isEqualTo(200);
		var mine = client.get().uri("/api/access/me/permissions")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat((List<String>) JsonPath.read(mine, "$.platform")).contains("access:role:manage");
	}

}
