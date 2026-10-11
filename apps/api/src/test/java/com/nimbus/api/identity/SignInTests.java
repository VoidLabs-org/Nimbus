package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SignInTests {

	@Autowired
	RestTestClient client;

	@Test
	void registeredUserCanSignInWithEmailInAnyCase() {
		register("Grace", "grace@example.com", "correct horse");

		signIn("Grace@Example.COM", "correct horse").expectStatus().isOk()
			.expectBody()
			.jsonPath("$.accessToken").isNotEmpty()
			.jsonPath("$.user.email").isEqualTo("grace@example.com")
			.jsonPath("$.user.displayName").isEqualTo("Grace");
	}

	@Test
	void wrongPasswordAndUnknownEmailFailTheSameWay() {
		register("Heidi", "heidi@example.com", "correct horse");

		var wrongPassword = signIn("heidi@example.com", "wrong horse").expectStatus().isUnauthorized()
			.expectBody(String.class).returnResult().getResponseBody();
		var unknownEmail = signIn("nobody@example.com", "correct horse").expectStatus().isUnauthorized()
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat(JsonPath.<String>read(wrongPassword, "$.detail")).isEqualTo("Invalid email or password");
		assertThat(JsonPath.<String>read(unknownEmail, "$.detail")).isEqualTo("Invalid email or password");
	}

	private void register(String displayName, String email, String password) {
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", password))
			.exchange()
			.expectStatus().isCreated();
	}

	private RestTestClient.ResponseSpec signIn(String email, String password) {
		return client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", password))
			.exchange();
	}

}
