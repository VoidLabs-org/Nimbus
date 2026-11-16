package com.nimbus.api.projects;

import static org.assertj.core.api.Assertions.assertThat;

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

/** {@code POST /api/projects/{key}/archive} and {@code /restore}, and what an Archived project refuses. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ArchiveProjectTests {

	@Autowired
	RestTestClient client;

	@Autowired
	Projects projects;

	private String register() {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

	private String create(String token) {
		var key = "A" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", key, "name", "Archivable")).exchange().expectStatus().isCreated();
		return key;
	}

	private RestTestClient.ResponseSpec post(String token, String path) {
		var request = client.post().uri(path);
		if (token != null) request = request.header("Authorization", "Bearer " + token);
		return request.exchange();
	}

	private RestTestClient.ResponseSpec get(String token, String path) {
		return client.get().uri(path).header("Authorization", "Bearer " + token).exchange();
	}

	@Test
	void archivingHidesTheProjectFromTheListAndShowsItUnderArchived() {
		var token = register();
		var key = create(token);

		post(token, "/api/projects/" + key + "/archive").expectStatus().isOk().expectBody()
			.jsonPath("$.key").isEqualTo(key).jsonPath("$.archived").isEqualTo(true);

		get(token, "/api/projects").expectBody().jsonPath("$.length()").isEqualTo(0);
		get(token, "/api/projects?archived=true").expectBody().jsonPath("$.length()").isEqualTo(1)
			.jsonPath("$[0].key").isEqualTo(key);
		get(token, "/api/projects/" + key).expectStatus().isOk().expectBody().jsonPath("$.archived").isEqualTo(true);
		assertThat(projects.findByKey(key).orElseThrow().archived()).isTrue();
	}

	@Test
	void restoringPutsItBackAndRepeatingEitherChangesNothing() {
		var token = register();
		var key = create(token);

		post(token, "/api/projects/" + key + "/restore").expectStatus().isOk().expectBody()
			.jsonPath("$.archived").isEqualTo(false);
		post(token, "/api/projects/" + key + "/archive").expectStatus().isOk();
		post(token, "/api/projects/" + key.toLowerCase() + "/archive").expectStatus().isOk().expectBody()
			.jsonPath("$.archived").isEqualTo(true);
		post(token, "/api/projects/" + key + "/restore").expectStatus().isOk().expectBody()
			.jsonPath("$.archived").isEqualTo(false);
		post(token, "/api/projects/" + key + "/restore").expectStatus().isOk();

		get(token, "/api/projects").expectBody().jsonPath("$.length()").isEqualTo(1);
		get(token, "/api/projects?archived=true").expectBody().jsonPath("$.length()").isEqualTo(0);
	}

	@Test
	void anArchivedProjectRefusesEditsAndKeepsItsKey() {
		var token = register();
		var key = create(token);
		post(token, "/api/projects/" + key + "/archive").expectStatus().isOk();

		client.patch().uri("/api/projects/" + key).header("Authorization", "Bearer " + token)
			.body(Map.of("name", "Nope")).exchange().expectStatus().isEqualTo(409);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", key, "name", "Again")).exchange().expectStatus().isEqualTo(409);

		post(token, "/api/projects/" + key + "/restore").expectStatus().isOk();
		client.patch().uri("/api/projects/" + key).header("Authorization", "Bearer " + token)
			.body(Map.of("name", "Fine")).exchange().expectStatus().isOk();
	}

	@Test
	void onlyMembersCanArchiveOrRestoreAndTheyNeedAToken() {
		var owner = register();
		var other = register();
		var key = create(owner);

		post(other, "/api/projects/" + key + "/archive").expectStatus().isNotFound();
		post(other, "/api/projects/" + key + "/restore").expectStatus().isNotFound();
		post(owner, "/api/projects/NOPE1/archive").expectStatus().isNotFound();
		post(null, "/api/projects/" + key + "/archive").expectStatus().isUnauthorized();
		post(null, "/api/projects/" + key + "/restore").expectStatus().isUnauthorized();
		get(owner, "/api/projects/" + key).expectBody().jsonPath("$.archived").isEqualTo(false);
		get(other, "/api/projects?archived=true").expectBody().jsonPath("$.length()").isEqualTo(0);
	}
}
