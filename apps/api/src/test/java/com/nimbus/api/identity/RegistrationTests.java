package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

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

	@Test
	void displayNameCannotContainControlCharacters() {
		register("\u0001", "dave@example.com", "correct horse").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.errors.displayName").isNotEmpty();

		register("Da\u0000ve", "dave@example.com", "correct horse").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.errors.displayName").isNotEmpty();
	}

	@Test
	void surroundingSpacesAreIgnored() {
		register("  Erin  ", "  Erin@Example.com ", "correct horse").expectStatus().isCreated()
			.expectBody()
			.jsonPath("$.user.email").isEqualTo("erin@example.com")
			.jsonPath("$.user.displayName").isEqualTo("Erin");
	}

	// Hashing is slow, so simultaneous requests all pass the "is it taken?" check and race to insert.
	@Test
	void simultaneousRegistrationsForOneEmailCreateOnlyOneUser() throws Exception {
		var attempts = 6;
		try (var pool = Executors.newFixedThreadPool(attempts)) {
			var statuses = new ArrayList<Future<Integer>>();
			for (var i = 0; i < attempts; i++) {
				statuses.add(pool.submit(() -> register("Frank", "frank@example.com", "correct horse")
					.expectBody(String.class).returnResult().getStatus().value()));
			}
			var results = new ArrayList<Integer>();
			for (var status : statuses) {
				results.add(status.get());
			}

			assertThat(results).containsOnly(201, 409).containsOnlyOnce(201);
		}
	}

	private RestTestClient.ResponseSpec register(String displayName, String email, String password) {
		return client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", password))
			.exchange();
	}

}
