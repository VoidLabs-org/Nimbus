package com.nimbus.api.projects;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/** {@code PATCH /api/projects/{key}}: renaming and describing a project. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class EditProjectTests {

	@Autowired
	RestTestClient client;

	private String register() {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

	private String create(String token, String description) {
		var key = "E" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
		var body = new HashMap<String, Object>(Map.of("key", key, "name", "Original"));
		if (description != null) body.put("description", description);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token).body(body)
			.exchange().expectStatus().isCreated();
		return key;
	}

	private RestTestClient.ResponseSpec patch(String token, String key, Map<String, ?> body) {
		var request = client.patch().uri("/api/projects/" + key);
		if (token != null) request = request.header("Authorization", "Bearer " + token);
		return request.body(body).exchange();
	}

	@Test
	void aMemberRenamesAndDescribesTheProjectAndTheKeyStays() {
		var token = register();
		var key = create(token, null);

		patch(token, key.toLowerCase(), Map.of("name", "  Renamed  ", "description", "About it")).expectStatus().isOk()
			.expectBody().jsonPath("$.key").isEqualTo(key).jsonPath("$.name").isEqualTo("Renamed")
			.jsonPath("$.description").isEqualTo("About it");

		client.get().uri("/api/projects/" + key).header("Authorization", "Bearer " + token).exchange()
			.expectBody().jsonPath("$.name").isEqualTo("Renamed").jsonPath("$.description").isEqualTo("About it");
	}

	@Test
	void fieldsNotSentStayAndANullOrBlankDescriptionClearsIt() {
		var token = register();
		var key = create(token, "Keep me");

		patch(token, key, Map.of("name", "Only name")).expectStatus().isOk().expectBody()
			.jsonPath("$.name").isEqualTo("Only name").jsonPath("$.description").isEqualTo("Keep me");

		var clear = new HashMap<String, Object>();
		clear.put("description", null);
		patch(token, key, clear).expectStatus().isOk().expectBody()
			.jsonPath("$.name").isEqualTo("Only name").jsonPath("$.description").isEmpty();

		patch(token, key, Map.of("description", "Again")).expectStatus().isOk();
		patch(token, key, Map.of("description", "  \n ")).expectStatus().isOk().expectBody()
			.jsonPath("$.description").isEmpty();
	}

	@Test
	void invalidFieldsAreRefusedWithFieldErrorsAndChangeNothing() {
		var token = register();
		var key = create(token, "Keep me");

		patch(token, key, Map.of("name", "   ", "description", "x".repeat(1001))).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.errors.name").isNotEmpty().jsonPath("$.errors.description").isNotEmpty();
		var nullName = new HashMap<String, Object>();
		nullName.put("name", null);
		patch(token, key, nullName).expectStatus().isBadRequest().expectBody().jsonPath("$.errors.name").isNotEmpty();

		client.get().uri("/api/projects/" + key).header("Authorization", "Bearer " + token).exchange()
			.expectBody().jsonPath("$.name").isEqualTo("Original").jsonPath("$.description").isEqualTo("Keep me");
	}

	@Test
	void sendingAKeyIsRefusedEvenTheSameOne() {
		var token = register();
		var key = create(token, null);

		patch(token, key, Map.of("key", key)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.key").isNotEmpty();
		patch(token, key, Map.of("key", "OTHER", "name", "Renamed")).expectStatus().isBadRequest();
		client.get().uri("/api/projects/" + key).header("Authorization", "Bearer " + token).exchange()
			.expectBody().jsonPath("$.name").isEqualTo("Original");
	}

	@Test
	void nonMembersAndUnknownKeysAreNotFoundEvenWithABadBody() {
		var owner = register();
		var outsider = register();
		var key = create(owner, null);

		patch(outsider, key, Map.of("name", "Hijacked")).expectStatus().isNotFound();
		patch(outsider, key, Map.of("name", "")).expectStatus().isNotFound();
		patch(owner, "NOPE", Map.of("name", "x")).expectStatus().isNotFound();
		client.get().uri("/api/projects/" + key).header("Authorization", "Bearer " + owner).exchange()
			.expectBody().jsonPath("$.name").isEqualTo("Original");
	}

	@Test
	void editingNeedsASignedInUser() {
		var key = create(register(), null);

		patch(null, key, Map.of("name", "x")).expectStatus().isUnauthorized();
	}
}
