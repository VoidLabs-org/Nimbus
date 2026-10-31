package com.nimbus.api.projects;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * {@code GET /api/projects}: the projects a User is a Member of. Every User here is new, so lists start empty, and
 * every key is made up for the test, since keys are unique across all projects and every test class shares one
 * database.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProjectListTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	@Test
	void aUserSeesTheProjectsTheyAreAMemberOf() {
		var token = register(true);
		var key = stem();
		create(token, key, "Listed project");

		listed(token)
			.jsonPath("$.length()").isEqualTo(1)
			.jsonPath("$[0].key").isEqualTo(key)
			.jsonPath("$[0].name").isEqualTo("Listed project");
	}

	@Test
	void theListIsSortedByNameWithoutRegardToCase() {
		var token = register(true);
		create(token, stem(), "Zebra");
		create(token, stem(), "apple");
		create(token, stem(), "Mango");

		listed(token).jsonPath("$[*].name").isEqualTo(List.of("apple", "Mango", "Zebra"));
	}

	@Test
	void theOrderIsDecidedByTheNamesThemselvesNotByTheDatabasesLocale() {
		var token = register(true);
		create(token, stem(), "NimbusApp");
		create(token, stem(), "Nimbus Web");

		// A space sorts before a letter. A locale-aware database collation skips the space and would put NimbusApp
		// first, so the same projects would list in a different order on a different database.
		listed(token).jsonPath("$[*].name").isEqualTo(List.of("Nimbus Web", "NimbusApp"));
	}

	@Test
	void projectsWithTheSameNameComeInKeyOrder() {
		var token = register(true);
		var stem = stem();
		create(token, stem + "B", "Twin");
		create(token, stem + "A", "Twin");

		listed(token).jsonPath("$[*].key").isEqualTo(List.of(stem + "A", stem + "B"));
	}

	@Test
	void anArchivedProjectIsLeftOut() {
		var token = register(true);
		var kept = stem();
		var archived = stem();
		create(token, kept, "Active project");
		create(token, archived, "Archived project");
		// Archiving has no endpoint until #41, so the state is arranged here; what is checked is the API's answer.
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", archived).update();

		listed(token).jsonPath("$[*].key").isEqualTo(List.of(kept));
	}

	@Test
	void aUserDoesNotSeeAnotherUsersProjects() {
		var dana = register(true);
		var eli = register(true);
		var danas = stem();
		var elis = stem();
		create(dana, danas, "Dana's project");
		create(eli, elis, "Eli's project");

		listed(dana).jsonPath("$[*].key").isEqualTo(List.of(danas));
		listed(eli).jsonPath("$[*].key").isEqualTo(List.of(elis));
	}

	@Test
	void aUserWhoIsNotAMemberOfAnyProjectGetsAnEmptyList() {
		var token = register(true);

		listed(token).json("[]");
	}

	@Test
	void eachListedProjectIsExactlyWhatOpeningItReturns() {
		var token = register(true);
		var key = stem();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", key, "name", "Shaped", "description", "About it"))
			.exchange().expectStatus().isCreated();

		var list = list(token).expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		var opened = client.get().uri("/api/projects/" + key).header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();

		Map<String, Object> listedProject = JsonPath.read(list, "$[0]");
		Map<String, Object> openedProject = JsonPath.read(opened, "$");
		assertThat(listedProject).containsOnlyKeys("id", "key", "name", "description", "archived", "createdAt")
			.isEqualTo(openedProject);
	}

	@Test
	void listingNeedsSignInAndAVerifiedEmail() {
		client.get().uri("/api/projects").exchange().expectStatus().isUnauthorized();

		var unverified = register(false);
		list(unverified).expectStatus().isForbidden().expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	/** The User's list. */
	private RestTestClient.ResponseSpec list(String token) {
		return client.get().uri("/api/projects").header("Authorization", "Bearer " + token).exchange();
	}

	/** The body of the User's list, once it has answered 200. */
	private RestTestClient.BodyContentSpec listed(String token) {
		return list(token).expectStatus().isOk().expectBody();
	}

	/** A key no other test uses: a letter and seven characters of a random id, so 8 of the 10 a key may have. */
	private static String stem() {
		return "T" + UUID.randomUUID().toString().replace("-", "").substring(0, 7).toUpperCase();
	}

	private void create(String token, String key, String name) {
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", key, "name", name)).exchange().expectStatus().isCreated();
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
}
