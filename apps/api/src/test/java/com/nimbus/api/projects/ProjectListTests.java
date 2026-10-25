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

/** {@code GET /api/projects}: the projects a User is a Member of. Every User here is new, so lists start empty. */
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
		create(token, "LISTA", "Listed project");

		listed(token)
			.jsonPath("$.length()").isEqualTo(1)
			.jsonPath("$[0].key").isEqualTo("LISTA")
			.jsonPath("$[0].name").isEqualTo("Listed project");
	}

	@Test
	void theListIsSortedByNameWithoutRegardToCase() {
		var token = register(true);
		create(token, "SORTZ", "Zebra");
		create(token, "SORTA", "apple");
		create(token, "SORTM", "Mango");

		listed(token).jsonPath("$[*].name").isEqualTo(List.of("apple", "Mango", "Zebra"));
	}

	@Test
	void theOrderIsDecidedByTheNamesThemselvesNotByTheDatabasesLocale() {
		var token = register(true);
		create(token, "NIMAPP", "NimbusApp");
		create(token, "NIMWEB", "Nimbus Web");

		// A space sorts before a letter. A locale-aware database collation skips the space and would put NimbusApp
		// first, so the same projects would list in a different order on a different database.
		listed(token).jsonPath("$[*].name").isEqualTo(List.of("Nimbus Web", "NimbusApp"));
	}

	@Test
	void projectsWithTheSameNameComeInKeyOrder() {
		var token = register(true);
		create(token, "SAMEB", "Twin");
		create(token, "SAMEA", "Twin");

		listed(token).jsonPath("$[*].key").isEqualTo(List.of("SAMEA", "SAMEB"));
	}

	@Test
	void anArchivedProjectIsLeftOut() {
		var token = register(true);
		create(token, "KEEPME", "Active project");
		create(token, "GONEME", "Archived project");
		// Archiving has no endpoint until #41, so the state is arranged here; what is checked is the API's answer.
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = 'GONEME'").update();

		listed(token).jsonPath("$[*].key").isEqualTo(List.of("KEEPME"));
	}

	@Test
	void aUserDoesNotSeeAnotherUsersProjects() {
		var dana = register(true);
		var eli = register(true);
		create(dana, "DANAPR", "Dana's project");
		create(eli, "ELIPR", "Eli's project");

		listed(dana).jsonPath("$[*].key").isEqualTo(List.of("DANAPR"));
		listed(eli).jsonPath("$[*].key").isEqualTo(List.of("ELIPR"));
	}

	@Test
	void aUserWhoIsNotAMemberOfAnyProjectGetsAnEmptyList() {
		var token = register(true);

		listed(token).json("[]");
	}

	@Test
	void eachListedProjectIsExactlyWhatOpeningItReturns() {
		var token = register(true);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "SHAPE", "name", "Shaped", "description", "About it"))
			.exchange().expectStatus().isCreated();

		var list = list(token).expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		var opened = client.get().uri("/api/projects/SHAPE").header("Authorization", "Bearer " + token)
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
