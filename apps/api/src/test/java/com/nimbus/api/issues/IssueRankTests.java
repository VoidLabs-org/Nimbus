package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

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

/** An Issue's Rank: its place in its project's single manual order (GLOSSARY.md, ADR 0012). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class IssueRankTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void newIssuesGoToTheBottomOfTheOrder() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "First");
		create(dana, key, "Second");
		create(dana, key, "Third");

		assertThat(titles(find(dana, key, "?sort=rank"))).containsExactly("First", "Second", "Third");
		// The newest is still first by the default sort, which this doesn't change.
		assertThat(titles(find(dana, key, ""))).containsExactly("Third", "Second", "First");
	}

	@Test
	void movingAnIssueToAnotherStatusKeepsItsPlaceInTheOrder() {
		var dana = register("Dana");
		var key = project(dana);
		var first = create(dana, key, "First");
		create(dana, key, "Second");
		var third = create(dana, key, "Third");
		var inProgress = statusId(dana, key, "In progress");

		moveTo(dana, third, inProgress);
		moveTo(dana, first, inProgress);

		assertThat(titles(find(dana, key, "?sort=rank"))).containsExactly("First", "Second", "Third");
		assertThat(titles(find(dana, key, "?sort=rank&status=In%20progress"))).containsExactly("First", "Third");
	}

	@Test
	void issuesMovedOutOfADeletedStatusKeepTheirPlaceInTheOrder() {
		var dana = register("Dana");
		var key = project(dana);
		var first = create(dana, key, "First");
		create(dana, key, "Second");
		var third = create(dana, key, "Third");
		var review = addStatus(dana, key, "Review");
		moveTo(dana, first, review);
		moveTo(dana, third, review);

		client.delete().uri("/api/projects/{key}/statuses/{id}?moveTo={to}", key, review, statusId(dana, key, "To do"))
			.header("Authorization", "Bearer " + dana.token()).exchange().expectStatus().isNoContent();

		assertThat(titles(find(dana, key, "?sort=rank&status=To%20do"))).containsExactly("First", "Second", "Third");
	}

	@Test
	@SuppressWarnings("unchecked")
	void theIssueSaysNothingAboutItsRankKey() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = create(dana, key, "Only");

		var body = new String(client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token())
			.exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
		assertThat((Map<String, Object>) JsonPath.read(body, "$")).doesNotContainKey("rank");
		assertThat((List<Map<String, Object>>) JsonPath.read(find(dana, key, "?sort=rank"), "$.items"))
			.allSatisfy(item -> assertThat(item).doesNotContainKey("rank"));
	}

	private void moveTo(Person who, String issueKey, String statusId) {
		client.put().uri("/api/issues/{key}/status", issueKey).header("Authorization", "Bearer " + who.token())
			.body(Map.of("statusId", statusId)).exchange().expectStatus().isOk();
	}

	private String addStatus(Person who, String projectKey, String name) {
		var body = new String(client.post().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("name", name, "category", "IN_PROGRESS"))
			.exchange().expectStatus().isCreated().expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
		return JsonPath.read(body, "$.id");
	}

	private String statusId(Person who, String projectKey, String name) {
		var body = new String(client.get().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody().returnResult()
			.getResponseBody(), StandardCharsets.UTF_8);
		List<String> ids = JsonPath.read(body, "$[?(@.name == '" + name + "')].id");
		return ids.getFirst();
	}

	private static List<String> titles(String body) {
		return JsonPath.read(body, "$.items[*].title");
	}

	private String find(Person who, String projectKey, String query) {
		return new String(client.get().uri(URI.create("/api/projects/" + projectKey + "/issues" + query))
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody().returnResult()
			.getResponseBody(), StandardCharsets.UTF_8);
	}

	/** Creates an Issue in the project's first To do Status and gives back its key. */
	private String create(Person who, String projectKey, String title) {
		var body = new String(client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", title))
			.exchange().expectStatus().isCreated().expectBody().returnResult().getResponseBody(),
				StandardCharsets.UTF_8);
		return JsonPath.read(body, "$.key");
	}

	private String project(Person owner) {
		var key = "R" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner.token())
			.body(Map.of("key", key, "name", "Project " + key)).exchange().expectStatus().isCreated();
		IssueRoles.give(jdbc, key, owner.id(), "project_admin");
		return key;
	}

	private Person register(String name) {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return new Person(token, JsonPath.read(response, "$.user.id"));
	}

}
