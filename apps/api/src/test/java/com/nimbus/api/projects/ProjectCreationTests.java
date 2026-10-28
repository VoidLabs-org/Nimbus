package com.nimbus.api.projects;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProjectCreationTests {

	@Autowired
	RestTestClient client;

	@Test
	void creatorCanOpenTheirProjectByKeyInAnyCase() {
		var token = register(true);
		var response = client.post().uri("/api/projects")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("key", "nIm", "name", "  Nimbus Web  ", "description", "Our planning app"))
			.exchange().expectStatus().isCreated()
			.expectBody().jsonPath("$.key").isEqualTo("NIM")
			.jsonPath("$.name").isEqualTo("Nimbus Web")
			.jsonPath("$.description").isEqualTo("Our planning app")
			.jsonPath("$.archived").isEqualTo(false)
			.jsonPath("$.createdAt").isNotEmpty()
			.returnResult().getResponseBody();
		String id = JsonPath.read(new String(response, java.nio.charset.StandardCharsets.UTF_8), "$.id");

		client.get().uri("/api/projects/nim").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk().expectBody()
			.jsonPath("$.id").isEqualTo(id)
			.jsonPath("$.key").isEqualTo("NIM")
			.jsonPath("$.name").isEqualTo("Nimbus Web")
			.jsonPath("$.description").isEqualTo("Our planning app");
	}

	private String register(boolean verified) {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		if (verified) EmailCodes.verify(client, token, email);
		return token;
	}

	@Test
	void nonMembersAndUnknownKeysAreIndistinguishable() {
		var owner = register(true);
		var outsider = register(true);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner)
			.body(Map.of("key", "PRIVATE", "name", "Private project"))
			.exchange().expectStatus().isCreated();
		for (var key : new String[] { "PRIVATE", "UNKNOWN" }) {
			client.get().uri("/api/projects/" + key).header("Authorization", "Bearer " + outsider)
				.exchange().expectStatus().isNotFound().expectBody()
				.jsonPath("$.detail").isEqualTo("Project not found");
		}
	}

	@Test
	void projectsRequireSignInAndAVerifiedEmail() {
		client.post().uri("/api/projects").body(Map.of("key", "AUTH", "name", "Auth project"))
			.exchange().expectStatus().isUnauthorized();
		client.get().uri("/api/projects/AUTH").exchange().expectStatus().isUnauthorized();
		var token = register(false);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "AUTH", "name", "Auth project"))
			.exchange().expectStatus().isForbidden().expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		client.get().uri("/api/projects/AUTH").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isForbidden().expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void namesMayRepeatAndDescriptionsMayBeOmittedOrNull() {
		var token = register(true);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "FIRST", "name", "Shared name"))
			.exchange().expectStatus().isCreated().expectBody().jsonPath("$.description").isEqualTo(null);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.contentType(org.springframework.http.MediaType.APPLICATION_JSON)
			.body("{\"key\":\"SECOND\",\"name\":\"Shared name\",\"description\":null}")
			.exchange().expectStatus().isCreated().expectBody().jsonPath("$.description").isEqualTo(null);
	}

	@Test
	void simultaneousCreatesHaveOneWinnerAndOnlyThatUserBecomesAMember() throws Exception {
		var first = register(true);
		var second = register(true);
		var start = new CountDownLatch(1);
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			var attempts = java.util.stream.Stream.of(first, second).map(token -> executor.submit(() -> {
				start.await();
				return client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
					.body(Map.of("key", "RACE", "name", "Concurrent project"))
					.exchange().returnResult(String.class).getStatus().value();
			})).toList();
			start.countDown();
			int firstStatus = attempts.get(0).get(15, java.util.concurrent.TimeUnit.SECONDS);
			int secondStatus = attempts.get(1).get(15, java.util.concurrent.TimeUnit.SECONDS);
			assertThat(java.util.List.of(firstStatus, secondStatus)).containsExactlyInAnyOrder(201, 409);
			client.get().uri("/api/projects/RACE").header("Authorization", "Bearer " + first)
				.exchange().expectStatus().isEqualTo(firstStatus == 201 ? 200 : 404);
			client.get().uri("/api/projects/RACE").header("Authorization", "Bearer " + second)
				.exchange().expectStatus().isEqualTo(secondStatus == 201 ? 200 : 404);
		}
	}

	@Test
	void aTakenKeyIsAFieldConflictEvenInAnotherCaseAndNeverGrantsMembership() {
		var creator = register(true);
		var other = register(true);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + creator)
			.body(Map.of("key", "TAKEN", "name", "Original"))
			.exchange().expectStatus().isCreated();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + other)
			.body(Map.of("key", "taken", "name", "Replacement"))
			.exchange().expectStatus().isEqualTo(409).expectBody().jsonPath("$.errors.key").exists();
		client.get().uri("/api/projects/TAKEN").header("Authorization", "Bearer " + other)
			.exchange().expectStatus().isNotFound();
		client.get().uri("/api/projects/TAKEN").header("Authorization", "Bearer " + creator)
			.exchange().expectStatus().isOk().expectBody().jsonPath("$.name").isEqualTo("Original");
	}

	@Test
	void surroundingWhitespaceIsStrippedBeforeTheNameIsChecked() {
		var token = register(true);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "PASTE", "name", "\tPasted name\n"))
			.exchange().expectStatus().isCreated().expectBody().jsonPath("$.name").isEqualTo("Pasted name");
	}

	@Test
	void theCreatedAtInTheCreateResponseIsTheOneALaterOpenReturns() {
		// The database keeps microseconds; the response must not carry more, or a refetch would change it.
		var token = register(true);
		String created = JsonPath.read(new String(client.post().uri("/api/projects")
			.header("Authorization", "Bearer " + token).body(Map.of("key", "TIME", "name", "Timed"))
			.exchange().expectStatus().isCreated().expectBody().returnResult().getResponseBody(),
				java.nio.charset.StandardCharsets.UTF_8), "$.createdAt");

		var instant = java.time.Instant.parse(created);
		assertThat(instant).isEqualTo(instant.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
		client.get().uri("/api/projects/TIME").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk().expectBody().jsonPath("$.createdAt").isEqualTo(created);
	}

	@Test
	void aKeyWrittenWithLettersThatCapitaliseToAsciiOnesOpensNothing() {
		var token = register(true);
		// Keys of their own: every test in the class shares one database, and NIM is taken by another test.
		for (var key : new String[] { "SAMZ", "NIMZ" }) {
			client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
				.body(Map.of("key", key, "name", "Project " + key)).exchange().expectStatus().isCreated();
		}
		for (var key : new String[] { "ſamz", "nımz" }) {
			client.get().uri("/api/projects/{key}", key).header("Authorization", "Bearer " + token)
				.exchange().expectStatus().isNotFound();
		}
	}

	@Test
	void descriptionsKeepLineBreaksButNotOtherControlCharacters() {
		var token = register(true);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "NUL", "name", "Valid name", "description", "Before\u0000after"))
			.exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors.description").exists();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "LINES", "name", "Valid name", "description", "First line\r\nSecond\tline"))
			.exchange().expectStatus().isCreated()
			.expectBody().jsonPath("$.description").isEqualTo("First line\r\nSecond\tline");
	}

	@Test
	void invalidFieldsHaveFieldErrorsAndDoNotReserveTheKey() {
		var token = register(true);
		for (var key : new String[] { "", "A", "1AB", "A-B", "ABCDEFGHIJK", "İA", "ßa", " AB" }) {
			client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
				.body(Map.of("key", key, "name", "Valid name"))
				.exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors.key").exists();
		}
		for (var name : new String[] { "", "   ", "x".repeat(101), "Bad\nname", "Bad\u0085name" }) {
			client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
				.body(Map.of("key", "VALID", "name", name))
				.exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors.name").exists();
		}
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "VALID", "name", "Valid name", "description", "x".repeat(1001)))
			.exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors.description").exists();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of()).exchange().expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.key").exists().jsonPath("$.errors.name").exists();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "VALID", "name", "x".repeat(100), "description", "x".repeat(1000)))
			.exchange().expectStatus().isCreated();
	}
}
