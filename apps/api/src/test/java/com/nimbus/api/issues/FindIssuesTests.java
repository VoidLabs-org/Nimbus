package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class FindIssuesTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void withoutFiltersItListsEveryIssueMostRecentlyUpdatedFirstWithTheTotal() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "Story", "First", "Medium", null);
		create(dana, key, "Bug", "Second", "Medium", null);
		create(dana, key, "Chore", "Third", "Medium", null);
		touch(key, 1);

		var body = find(dana, key, "");
		assertThat(titles(body)).containsExactly("First", "Third", "Second");
		assertThat((Integer) JsonPath.read(body, "$.total")).isEqualTo(3);
		assertThat((Integer) JsonPath.read(body, "$.page")).isZero();
		assertThat((Integer) JsonPath.read(body, "$.size")).isEqualTo(50);
		assertThat((String) JsonPath.read(body, "$.items[0].key")).isEqualTo(key + "-1");
		assertThat((String) JsonPath.read(body, "$.items[0].status.category")).isEqualTo("TODO");
	}

	@Test
	void anEmptyResultIsOkWithAZeroTotal() {
		var dana = register("Dana");
		var key = project(dana);

		var body = find(dana, key, "");
		assertThat(titles(body)).isEmpty();
		assertThat((Integer) JsonPath.read(body, "$.total")).isZero();
		create(dana, key, "Story", "Only", "Low", null);
		assertThat(titles(find(dana, key, "?priority=Urgent"))).isEmpty();
	}

	@Test
	void itFiltersByTypePriorityAndTitleWordsAndTheFiltersCombine() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "Bug", "Login page crashes", "Urgent", null);
		create(dana, key, "Bug", "Logout is slow", "Low", null);
		create(dana, key, "Story", "Login with Google", "Urgent", null);
		create(dana, key, "Chore", "100% sure_thing", "Medium", null);

		assertThat(titles(find(dana, key, "?type=Bug"))).containsExactlyInAnyOrder("Login page crashes", "Logout is slow");
		assertThat(titles(find(dana, key, "?priority=Urgent"))).containsExactlyInAnyOrder("Login page crashes",
				"Login with Google");
		assertThat(titles(find(dana, key, "?q=login"))).containsExactlyInAnyOrder("Login page crashes", "Login with Google");
		assertThat(titles(find(dana, key, "?q=google%20LOGIN"))).containsExactly("Login with Google");
		assertThat(titles(find(dana, key, "?type=Bug&priority=Urgent&q=login"))).containsExactly("Login page crashes");
		assertThat(titles(find(dana, key, "?type=Story&priority=Low"))).isEmpty();
		// Wildcard characters in the words are plain text.
		assertThat(titles(find(dana, key, "?q=%25"))).containsExactly("100% sure_thing");
		assertThat(titles(find(dana, key, "?q=_"))).containsExactly("100% sure_thing");
		assertThat(titles(find(dana, key, "?q=sure_thing"))).containsExactly("100% sure_thing");
		assertThat(titles(find(dana, key, "?q=%5C"))).isEmpty();
	}

	@Test
	void itFiltersByAssigneeMeAndUnassigned() {
		var dana = register("Dana");
		var key = project(dana);
		var sam = register("Sam");
		addMember(key, sam);
		create(dana, key, "Story", "Mine", "Medium", dana.id());
		create(dana, key, "Story", "Sams", "Medium", sam.id());
		create(dana, key, "Story", "Nobodys", "Medium", null);

		assertThat(titles(find(dana, key, "?assignee=me"))).containsExactly("Mine");
		assertThat(titles(find(sam, key, "?assignee=me"))).containsExactly("Sams");
		assertThat(titles(find(dana, key, "?assignee=none"))).containsExactly("Nobodys");
		assertThat(titles(find(dana, key, "?assignee=" + sam.id()))).containsExactly("Sams");
		assertThat(titles(find(dana, key, "?assignee=" + UUID.randomUUID()))).isEmpty();
	}

	@Test
	void itFiltersByStatusAndStatusCategory() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "Story", "Todo one", "Medium", null);
		create(dana, key, "Story", "Doing", "Medium", null);
		create(dana, key, "Story", "Finished", "Medium", null);
		move(key, 2, "In progress");
		move(key, 3, "Done");

		assertThat(titles(find(dana, key, "?category=TODO"))).containsExactly("Todo one");
		assertThat(titles(find(dana, key, "?category=IN_PROGRESS"))).containsExactly("Doing");
		assertThat(titles(find(dana, key, "?category=DONE"))).containsExactly("Finished");
		assertThat(titles(find(dana, key, "?status=done"))).containsExactly("Finished");
		assertThat(titles(find(dana, key, "?status=In%20progress&category=DONE"))).isEmpty();
	}

	@Test
	void itSortsByUpdatedCreatedAndPriority() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "Story", "Low old", "Low", null);
		create(dana, key, "Story", "Urgent mid", "Urgent", null);
		create(dana, key, "Story", "High new", "High", null);
		create(dana, key, "Story", "Urgent newest", "Urgent", null);
		create(dana, key, "Story", "Medium last", "Medium", null);
		touch(key, 1);

		assertThat(titles(find(dana, key, ""))).containsExactly("Low old", "Medium last", "Urgent newest", "High new",
				"Urgent mid");
		assertThat(titles(find(dana, key, "?sort=updated"))).containsExactly("Low old", "Medium last", "Urgent newest",
				"High new", "Urgent mid");
		assertThat(titles(find(dana, key, "?sort=created"))).containsExactly("Medium last", "Urgent newest", "High new",
				"Urgent mid", "Low old");
		assertThat(titles(find(dana, key, "?sort=priority"))).containsExactly("Urgent newest", "Urgent mid", "High new",
				"Medium last", "Low old");
	}

	@Test
	void itPagesThroughIssuesWithoutRepeatsAndReportsTheTotal() {
		var dana = register("Dana");
		var key = project(dana);
		for (int number = 1; number <= 5; number++) create(dana, key, "Story", "Issue " + number, "Medium", null);

		var first = find(dana, key, "?size=2");
		var second = find(dana, key, "?size=2&page=1");
		var third = find(dana, key, "?size=2&page=2");
		var beyond = find(dana, key, "?size=2&page=3");
		assertThat(titles(first)).containsExactly("Issue 5", "Issue 4");
		assertThat(titles(second)).containsExactly("Issue 3", "Issue 2");
		assertThat(titles(third)).containsExactly("Issue 1");
		assertThat(titles(beyond)).isEmpty();
		for (var body : List.of(first, second, third, beyond)) {
			assertThat((Integer) JsonPath.read(body, "$.total")).isEqualTo(5);
			assertThat((Integer) JsonPath.read(body, "$.size")).isEqualTo(2);
		}
		assertThat((Integer) JsonPath.read(second, "$.page")).isEqualTo(1);
	}

	@Test
	void itOnlyListsTheProjectsOwnIssues() {
		var dana = register("Dana");
		var key = project(dana);
		var other = project(dana);
		create(dana, key, "Story", "Here", "Medium", null);
		create(dana, other, "Story", "There", "Medium", null);

		assertThat(titles(find(dana, key, ""))).containsExactly("Here");
	}

	@Test
	void invalidFiltersGetBadRequestWithErrorsPerParameter() {
		var dana = register("Dana");
		var key = project(dana);
		for (var query : new String[] { "category=nope", "type=Epic", "priority=Huge", "assignee=bob", "sort=oldest",
				"page=-1", "size=0", "size=101" }) {
			get(dana, key, "?" + query).expectStatus().isBadRequest();
		}
		get(dana, key, "?sort=oldest&size=0").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.sort").exists().jsonPath("$.errors.size").exists();
		get(dana, key, "?page=abc").expectStatus().isBadRequest().expectBody().jsonPath("$.errors.page").exists();
		get(dana, key, "?q=a%20b%20c%20d%20e%20f%20g%20h%20i%20j%20k").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.q").exists();
		get(dana, key, "?size=100").expectStatus().isOk();
	}

	@Test
	void nonMembersAndUnknownProjectsGetNotFoundAndNoTokenGetsUnauthorized() {
		var dana = register("Dana");
		var key = project(dana);
		var eve = register("Eve");
		create(dana, key, "Story", "Secret", "Medium", null);

		get(eve, key, "").expectStatus().isNotFound();
		get(dana, "NOSUCH", "").expectStatus().isNotFound();
		client.get().uri("/api/projects/{key}/issues", key).exchange().expectStatus().isUnauthorized();
	}

	@Test
	@SuppressWarnings("unchecked")
	void countsGiveTheTotalAndEachValuesCountLeavingOutThatFieldsOwnFilter() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "Bug", "Login crashes", "Urgent", null);
		create(dana, key, "Bug", "Logout is slow", "Low", null);
		create(dana, key, "Story", "Login with Google", "Urgent", null);
		create(dana, key, "Chore", "Tidy up", "Medium", null);
		move(key, 2, "In progress");

		var all = counts(dana, key, "");
		assertThat((Integer) JsonPath.read(all, "$.total")).isEqualTo(4);
		assertThat((Map<String, Integer>) JsonPath.read(all, "$.types")).containsEntry("Bug", 2)
			.containsEntry("Story", 1).containsEntry("Chore", 1);
		assertThat((Map<String, Integer>) JsonPath.read(all, "$.categories")).containsEntry("TODO", 3)
			.containsEntry("IN_PROGRESS", 1).doesNotContainKey("DONE");
		var inProgress = statusId(dana, key, "In progress");
		assertThat((Map<String, Integer>) JsonPath.read(all, "$.statuses")).containsEntry(inProgress, 1);

		// With Bug chosen the total and the other fields narrow, but every type still shows its own count.
		var bugs = counts(dana, key, "?type=Bug");
		assertThat((Integer) JsonPath.read(bugs, "$.total")).isEqualTo(2);
		assertThat((Map<String, Integer>) JsonPath.read(bugs, "$.types")).containsEntry("Bug", 2)
			.containsEntry("Story", 1).containsEntry("Chore", 1);
		assertThat((Map<String, Integer>) JsonPath.read(bugs, "$.priorities")).containsEntry("Urgent", 1)
			.containsEntry("Low", 1).doesNotContainKey("Medium");

		// The search and the quick filters narrow every field.
		var login = counts(dana, key, "?q=login");
		assertThat((Integer) JsonPath.read(login, "$.total")).isEqualTo(2);
		assertThat((Map<String, Integer>) JsonPath.read(login, "$.types")).containsEntry("Bug", 1)
			.containsEntry("Story", 1).doesNotContainKey("Chore");
	}

	@Test
	void countsTakeTheSameFiltersAndRefuseTheSameWay() {
		var dana = register("Dana");
		var eve = register("Eve");
		var key = project(dana);

		client.get().uri(URI.create("/api/projects/" + key + "/issues/counts?type=Epic"))
			.header("Authorization", "Bearer " + dana.token()).exchange().expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.type").exists();
		client.get().uri(URI.create("/api/projects/" + key + "/issues/counts"))
			.header("Authorization", "Bearer " + eve.token()).exchange().expectStatus().isNotFound();
		assertThat((Integer) JsonPath.read(counts(dana, key, ""), "$.total")).isZero();
	}

	private String counts(Person who, String projectKey, String query) {
		return new String(client.get().uri(URI.create("/api/projects/" + projectKey + "/issues/counts" + query))
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody().returnResult()
			.getResponseBody(), StandardCharsets.UTF_8);
	}

	private String statusId(Person who, String projectKey, String name) {
		var body = new String(client.get().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody().returnResult()
			.getResponseBody(), StandardCharsets.UTF_8);
		List<String> ids = JsonPath.read(body, "$[?(@.name == '" + name + "')].id");
		return ids.getFirst();
	}

	/** There is no endpoint to edit an Issue yet, so it is made the most recently updated in the table. */
	private void touch(String projectKey, int number) {
		jdbc.sql("""
				UPDATE issues SET updated_at = now() + interval '1 hour'
				WHERE number = :number AND project_id = (SELECT id FROM projects WHERE key = :key)
				""").param("key", projectKey).param("number", number).update();
	}

	/** There is no endpoint to move an Issue yet, so the Status is set in the table. */
	private void move(String projectKey, int number, String statusName) {
		jdbc.sql("""
				UPDATE issues i SET status_id = (SELECT s.id FROM issue_statuses s WHERE s.project_id = i.project_id AND s.name = :status)
				WHERE i.number = :number AND i.project_id = (SELECT id FROM projects WHERE key = :key)
				""").param("status", statusName).param("key", projectKey).param("number", number).update();
	}

	/** There is no endpoint to add Members yet. */
	private void addMember(String projectKey, Person person) {
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) SELECT id, :user, now() FROM projects WHERE key = :key")
			.param("user", UUID.fromString(person.id())).param("key", projectKey).update();
		IssueRoles.give(jdbc, projectKey, person.id(), "developer");
	}

	private static List<String> titles(String body) {
		return JsonPath.read(body, "$.items[*].title");
	}

	private String find(Person who, String projectKey, String query) {
		return new String(get(who, projectKey, query).expectStatus().isOk().expectBody().returnResult().getResponseBody(),
				StandardCharsets.UTF_8);
	}

	/** The query is sent as written, already percent-encoded. */
	private RestTestClient.ResponseSpec get(Person who, String projectKey, String query) {
		return client.get().uri(URI.create("/api/projects/" + projectKey + "/issues" + query))
			.header("Authorization", "Bearer " + who.token()).exchange();
	}

	private void create(Person who, String projectKey, String type, String title, String priority, String assigneeId) {
		var body = new HashMap<String, Object>(Map.of("type", type, "title", title, "priority", priority));
		if (assigneeId != null) body.put("assigneeId", assigneeId);
		client.post().uri("/api/projects/{key}/issues", projectKey).header("Authorization", "Bearer " + who.token())
			.body(body).exchange().expectStatus().isCreated();
	}

	private String project(Person owner) {
		var key = "F" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
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
