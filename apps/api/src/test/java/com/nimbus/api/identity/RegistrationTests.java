package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class RegistrationTests {

	@Autowired
	RestTestClient client;

	@Test
	void visitorCanRegisterAndIsSignedInStraightAway() {
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Alice", "email", "alice@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isEqualTo(HttpStatus.CREATED)
			.expectHeader().value("Cache-Control", value -> assertThat(value).contains("no-store"))
			.expectBody()
			.jsonPath("$.accessToken").isNotEmpty()
			.jsonPath("$.user.id").isNotEmpty()
			.jsonPath("$.user.email").isEqualTo("alice@example.com")
			.jsonPath("$.user.displayName").isEqualTo("Alice")
			.jsonPath("$.user.avatarUrl").doesNotExist()
			.jsonPath("$.user.passwordHash").doesNotExist();
	}

	@Test
	void emailIsRegisteredOnlyOnceRegardlessOfCase() {
		register("Bob", "bob@example.com", "correct horse").expectStatus().isCreated();

		register("Bobby", "Bob@Example.COM", "another password").expectStatus().isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void invalidFieldsAreRejectedWithAMessagePerField() {
		register(" ", "not-an-email", "short").expectStatus().isBadRequest()
			.expectBody()
			.jsonPath("$.errors.displayName").isNotEmpty()
			.jsonPath("$.errors.email").isNotEmpty()
			.jsonPath("$.errors.password").isNotEmpty();
	}

	@Test
	void passwordMustBeAtMost128Characters() {
		register("Carol", "carol@example.com", "a".repeat(129)).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.errors.password").isNotEmpty();

		register("Carol", "carol@example.com", "a".repeat(128)).expectStatus().isCreated();
	}

	private RestTestClient.ResponseSpec register(String displayName, String email, String password) {
		return client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", password))
			.exchange();
	}

}
