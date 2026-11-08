package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Dragging an Issue up or down: {@code PUT /api/issues/{key}/rank} (feature spec #232, ticket #234). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ReorderIssueTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void anIssueDroppedBetweenTwoOthersLandsThere() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var c = create(dana, key, "C");
		var d = create(dana, key, "D");

		reorder(dana, d, a, b).expectStatus().isOk().expectBody().jsonPath("$.key").isEqualTo(d);
		assertThat(order(dana, key)).containsExactly("A", "D", "B", "C");

		reorder(dana, a, c, null).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("D", "B", "C", "A");
	}

	@Test
	void droppedAtTheTopOfAColumnItGoesDirectlyBeforeTheFirst() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var c = create(dana, key, "C");

		reorder(dana, c, null, a).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("C", "A", "B");
		reorder(dana, b, null, c).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("B", "C", "A");
	}

	@Test
	void withoutNeighboursTheRankIsKept() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "A");
		var b = create(dana, key, "B");
		create(dana, key, "C");
		var before = ranks(key);

		reorder(dana, b, null, null).expectStatus().isOk();

		assertThat(ranks(key)).isEqualTo(before);
	}

	@Test
	void issuesHiddenByAFilterBetweenTheNeighboursDoNotMatter() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var hidden = create(dana, key, "Hidden");
		var c = create(dana, key, "C");
		var d = create(dana, key, "D");
		moveTo(dana, hidden, statusId(dana, key, "Done"));

		// In the To do column the Issue was dropped after A, with the one in Done not shown between A and C.
		reorder(dana, d, a, c).expectStatus().isOk();

		assertThat(order(dana, key)).containsExactly("A", "D", "Hidden", "C");
	}

	@Test
	void aNeighbourThatMovedToAnotherStatusIsIgnored() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var c = create(dana, key, "C");
		moveTo(dana, a, statusId(dana, key, "Done"));

		// `after` is no longer in the column: the drop falls back to being directly before `before`.
		reorder(dana, c, a, b).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("A", "C", "B");

		// Both gone from the column: nothing usable, the Rank is kept.
		moveTo(dana, b, statusId(dana, key, "Done"));
		var kept = ranks(key);
		reorder(dana, c, a, b).expectStatus().isOk();
		assertThat(ranks(key)).isEqualTo(kept);
	}

	@Test
	void anyStatusUsesNeighboursOfOtherStatusesForTheTable() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var c = create(dana, key, "C");
		var d = create(dana, key, "D");
		moveTo(dana, b, statusId(dana, key, "Done"));
		moveTo(dana, c, statusId(dana, key, "Done"));

		// In the Table, D (To do) dropped between B and C (both Done): placed there, its Status kept.
		reorderAnyStatus(dana, d, b, c).expectStatus().isOk().expectBody()
			.jsonPath("$.status.name").isEqualTo("To do");
		assertThat(order(dana, key)).containsExactly("A", "B", "D", "C");

		// Only `before` given, in another Status: directly before it.
		reorderAnyStatus(dana, a, null, c).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("B", "D", "A", "C");
	}

	@Test
	void anyStatusIsSilentAndNotTakenWithAStatusChange() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		moveTo(dana, b, statusId(dana, key, "Done"));
		var version = JsonPath.read(open(dana, a), "$.version");

		reorderAnyStatus(dana, a, b, null).expectStatus().isOk();
		assertThat((Object) JsonPath.read(open(dana, a), "$.version")).isEqualTo(version);

		var body = new HashMap<String, Object>();
		body.put("statusId", statusId(dana, key, "Done"));
		body.put("after", b);
		body.put("anyStatus", true);
		client.put().uri("/api/issues/{key}/rank", a).header("Authorization", "Bearer " + dana.token()).body(body)
			.exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors.anyStatus").exists();
		assertThat((String) JsonPath.read(open(dana, a), "$.status.name")).isEqualTo("To do");
	}

	@Test
	void aNeighbourDeletedMeanwhileIsIgnored() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var c = create(dana, key, "C");
		delete(dana, a);

		reorder(dana, c, a, b).expectStatus().isOk();

		assertThat(order(dana, key)).containsExactly("C", "B");
	}

	@Test
	void theIssueItselfAsANeighbourIsIgnored() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var c = create(dana, key, "C");

		reorder(dana, c, c, a).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("C", "A", "B");
		reorder(dana, b, b, null).expectStatus().isOk();
		assertThat(order(dana, key)).containsExactly("C", "A", "B");
	}

	@Test
	void anUnknownNeighbourOrOneFromAnotherProjectIsRefused() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var otherKey = project(dana);
		var foreign = create(dana, otherKey, "Foreign");
		var before = ranks(key);

		reorder(dana, b, key + "-999", null).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.after").exists();
		reorder(dana, b, null, foreign).expectStatus().isBadRequest().expectBody().jsonPath("$.errors.before").exists();
		reorder(dana, b, "nonsense", a).expectStatus().isBadRequest().expectBody().jsonPath("$.errors.after").exists();
		reorder(dana, b, "NOPE-1", a).expectStatus().isBadRequest();
		reorder(dana, b, key + "-999", foreign).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.after").exists().jsonPath("$.errors.before").exists();

		assertThat(ranks(key)).isEqualTo(before);
	}

	@Test
	void aReorderLeavesUpdatedAtVersionAndHistoryAlone() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		create(dana, key, "B");
		var c = create(dana, key, "C");
		var openedBefore = open(dana, c);
		var historyBefore = history(dana, c);

		reorder(dana, c, null, a).expectStatus().isOk();

		var after = open(dana, c);
		assertThat((String) JsonPath.read(after, "$.updatedAt")).isEqualTo(JsonPath.read(openedBefore, "$.updatedAt"));
		assertThat((Integer) JsonPath.read(after, "$.version")).isEqualTo(JsonPath.read(openedBefore, "$.version"));
		assertThat(history(dana, c)).isEqualTo(historyBefore);
		assertThat(order(dana, key)).containsExactly("C", "A", "B");
	}

	@Test
	void whoMayMoveAnIssueMayReorderIt() {
		var admin = register("Ada");
		var viewer = register("Vic");
		var stranger = register("Sam");
		var key = project(admin);
		member(key, viewer, "viewer");
		var a = create(admin, key, "A");
		var b = create(admin, key, "B");

		client.put().uri("/api/issues/{key}/status", b).header("Authorization", "Bearer " + viewer.token())
			.body(Map.of("statusId", statusId(admin, key, "Done"))).exchange().expectStatus().isForbidden();
		reorder(viewer, b, null, a).expectStatus().isForbidden();
		reorder(stranger, b, null, a).expectStatus().isNotFound();
		reorder(admin, "NOPE-1", null, null).expectStatus().isNotFound();
		client.put().uri("/api/issues/{key}/rank", b).body(Map.of("before", a)).exchange().expectStatus()
			.isUnauthorized();
		assertThat(order(admin, key)).containsExactly("A", "B");
	}

	@Test
	void anArchivedProjectRefusesReorders() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();

		reorder(dana, b, null, a).expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").doesNotExist();

		assertThat(order(dana, key)).containsExactly("A", "B");
	}

	@Test
	void concurrentReordersNeverGiveTwoIssuesTheSamePlace() throws Exception {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var movers = new ArrayList<String>();
		for (int index = 0; index < 8; index++) movers.add(create(dana, key, "M" + index));
		var b = create(dana, key, "B");

		var pool = Executors.newFixedThreadPool(8);
		try {
			List<Callable<Integer>> drops = movers.stream()
				.<Callable<Integer>>map(mover -> () -> reorder(dana, mover, a, b).returnResult().getStatus().value())
				.toList();
			for (var result : pool.invokeAll(drops)) assertThat(result.get()).isEqualTo(200);
		}
		finally {
			pool.shutdownNow();
		}

		assertThat(ranks(key)).doesNotHaveDuplicates().hasSize(10);
		var titles = order(dana, key);
		assertThat(titles.getFirst()).isEqualTo("A");
		assertThat(titles).hasSize(10);
	}

	@Test
	void aReorderRacingADeleteOfTheSameIssueIsAnswerOrNotFoundNeverAnError() throws Exception {
		var dana = register("Dana");
		var key = project(dana);
		var anchor = create(dana, key, "Anchor");
		var pool = Executors.newFixedThreadPool(2);
		try {
			for (int round = 0; round < 6; round++) {
				var victim = create(dana, key, "Victim " + round);
				List<Callable<Integer>> both = List.of(
						() -> reorder(dana, victim, anchor, null).returnResult().getStatus().value(),
						() -> client.method(HttpMethod.DELETE).uri("/api/issues/{key}", victim)
							.header("Authorization", "Bearer " + dana.token()).exchange().returnResult().getStatus()
							.value());
				var results = pool.invokeAll(both);
				// The reorder waits for the delete (404) or finishes first (200); the delete always works.
				assertThat(results.get(0).get()).isIn(200, 404);
				assertThat(results.get(1).get()).isEqualTo(204);
			}
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void repeatedDropsIntoTheSameGapRenumberTheProjectAndKeepTheOrder() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var x = create(dana, key, "X");
		var y = create(dana, key, "Y");
		create(dana, key, "B");
		create(dana, key, "Tail");

		// X and Y take turns being dropped directly after A, each into the gap the other just left narrower.
		var longest = 0;
		for (int round = 0; round < 250; round++) {
			reorder(dana, y, a, x).expectStatus().isOk();
			reorder(dana, x, a, y).expectStatus().isOk();
			longest = Math.max(longest, ranks(key).stream().mapToInt(String::length).max().orElseThrow());
		}

		// Without renumbering, 500 drops would make keys of about a hundred characters.
		assertThat(longest).isLessThan(60);
		assertThat(order(dana, key)).containsExactly("A", "X", "Y", "B", "Tail");
		assertThat(ranks(key)).doesNotHaveDuplicates();
	}

	@Test
	void aDropBetweenTwoCardsOfAnotherStatusChangesTheStatusAndThePlaceInOneRequest() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		create(dana, key, "C");
		var d = create(dana, key, "D");
		var done = statusId(dana, key, "Done");
		moveTo(dana, a, done);
		moveTo(dana, b, done);
		var openedBefore = open(dana, d);

		// Dropped in the Done column between A and B, which are not in its old column.
		reorder(dana, d, done, a, b).expectStatus().isOk().expectBody().jsonPath("$.status.name").isEqualTo("Done");

		assertThat(order(dana, key)).containsExactly("A", "D", "B", "C");
		var after = open(dana, d);
		assertThat((String) JsonPath.read(after, "$.status.id")).isEqualTo(done);
		assertThat((String) JsonPath.read(after, "$.updatedAt")).isNotEqualTo(JsonPath.read(openedBefore, "$.updatedAt"));
		// Like PUT .../status: one history entry, and the version (kept for text edits) stays.
		assertThat((Integer) JsonPath.read(after, "$.version")).isEqualTo(JsonPath.read(openedBefore, "$.version"));
		var history = history(dana, d);
		assertThat((Integer) JsonPath.read(history, "$.length()")).isEqualTo(2);
		assertThat((String) JsonPath.read(history, "$[0].field")).isEqualTo("status");
		assertThat((String) JsonPath.read(history, "$[0].before")).isEqualTo("To do");
		assertThat((String) JsonPath.read(history, "$[0].after")).isEqualTo("Done");
	}

	@Test
	void aDropIntoAnEmptyColumnChangesTheStatusAndKeepsTheRank() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, "A");
		var b = create(dana, key, "B");
		create(dana, key, "C");
		var ranks = ranks(key);

		reorder(dana, b, statusId(dana, key, "In progress"), null, null).expectStatus().isOk().expectBody()
			.jsonPath("$.status.name").isEqualTo("In progress");

		assertThat(ranks(key)).isEqualTo(ranks);
		assertThat(order(dana, key)).containsExactly("A", "B", "C");
	}

	@Test
	void theStatusItIsAlreadyInChangesNothingButThePlace() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		create(dana, key, "B");
		var c = create(dana, key, "C");
		var historyBefore = history(dana, c);

		reorder(dana, c, statusId(dana, key, "To do"), null, a).expectStatus().isOk();

		assertThat(order(dana, key)).containsExactly("C", "A", "B");
		assertThat(history(dana, c)).isEqualTo(historyBefore);
	}

	@Test
	void aStatusOfAnotherProjectOrABadNeighbourIsRefusedAndChangesNothing() {
		var dana = register("Dana");
		var key = project(dana);
		var a = create(dana, key, "A");
		var b = create(dana, key, "B");
		var otherKey = project(dana);
		create(dana, otherKey, "Foreign");
		var foreignStatus = statusId(dana, otherKey, "Done");
		var ranks = ranks(key);
		var historyBefore = history(dana, b);

		reorder(dana, b, foreignStatus, null, a).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.statusId").exists();
		reorder(dana, b, UUID.randomUUID().toString(), null, a).expectStatus().isBadRequest();
		// Every field is checked before anything is written, and the errors come back together.
		reorder(dana, b, foreignStatus, key + "-999", null).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.statusId").exists().jsonPath("$.errors.after").exists();
		// A good Status with a neighbour that never existed: the Status change is undone with the rest.
		reorder(dana, b, statusId(dana, key, "Done"), key + "-999", null).expectStatus().isBadRequest();

		assertThat(ranks(key)).isEqualTo(ranks);
		assertThat((String) JsonPath.read(open(dana, b), "$.status.name")).isEqualTo("To do");
		assertThat(history(dana, b)).isEqualTo(historyBefore);
	}

	@Test
	void whoMayNotMoveAnIssueMayNotDropItInAnotherStatus() {
		var admin = register("Ada");
		var viewer = register("Vic");
		var key = project(admin);
		member(key, viewer, "viewer");
		var a = create(admin, key, "A");

		reorder(viewer, a, statusId(admin, key, "Done"), null, null).expectStatus().isForbidden();

		assertThat((String) JsonPath.read(open(admin, a), "$.status.name")).isEqualTo("To do");
	}

	// helpers

	private RestTestClient.ResponseSpec reorder(Person who, String issueKey, String statusId, String after,
			String before) {
		var body = new HashMap<String, Object>();
		body.put("statusId", statusId);
		if (after != null) body.put("after", after);
		if (before != null) body.put("before", before);
		return client.put().uri("/api/issues/{key}/rank", issueKey).header("Authorization", "Bearer " + who.token())
			.body(body).exchange();
	}

	private RestTestClient.ResponseSpec reorder(Person who, String issueKey, String after, String before) {
		var body = new HashMap<String, Object>();
		if (after != null) body.put("after", after);
		if (before != null) body.put("before", before);
		return client.put().uri("/api/issues/{key}/rank", issueKey).header("Authorization", "Bearer " + who.token())
			.body(body).exchange();
	}

	/** A reorder from the Table, whose rows are of every Status. */
	private RestTestClient.ResponseSpec reorderAnyStatus(Person who, String issueKey, String after, String before) {
		var body = new HashMap<String, Object>();
		if (after != null) body.put("after", after);
		if (before != null) body.put("before", before);
		body.put("anyStatus", true);
		return client.put().uri("/api/issues/{key}/rank", issueKey).header("Authorization", "Bearer " + who.token())
			.body(body).exchange();
	}

	private List<String> ranks(String projectKey) {
		return jdbc.sql("""
				SELECT i.rank FROM issues i JOIN projects p ON p.id = i.project_id WHERE p.key = :key ORDER BY i.rank
				""").param("key", projectKey).query(String.class).list();
	}

	/** Titles of the whole project in Rank order. */
	private List<String> order(Person who, String projectKey) {
		return JsonPath.read(find(who, projectKey, "?sort=rank&size=100"), "$.items[*].title");
	}

	private String find(Person who, String projectKey, String query) {
		return new String(client.get().uri(URI.create("/api/projects/" + projectKey + "/issues" + query))
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody().returnResult()
			.getResponseBody(), StandardCharsets.UTF_8);
	}

	private String open(Person who, String issueKey) {
		return new String(client.get().uri("/api/issues/{key}", issueKey).header("Authorization", "Bearer " + who.token())
			.exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
	}

	private String history(Person who, String issueKey) {
		return new String(client.get().uri("/api/issues/{key}/history", issueKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody()
			.returnResult().getResponseBody(), StandardCharsets.UTF_8);
	}

	private void moveTo(Person who, String issueKey, String statusId) {
		client.put().uri("/api/issues/{key}/status", issueKey).header("Authorization", "Bearer " + who.token())
			.body(Map.of("statusId", statusId)).exchange().expectStatus().isOk();
	}

	private void delete(Person who, String issueKey) {
		client.method(HttpMethod.DELETE).uri("/api/issues/{key}", issueKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isNoContent();
	}

	private String statusId(Person who, String projectKey, String name) {
		var body = new String(client.get().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody().returnResult()
			.getResponseBody(), StandardCharsets.UTF_8);
		List<String> ids = JsonPath.read(body, "$[?(@.name == '" + name + "')].id");
		return ids.getFirst();
	}

	private String create(Person who, String projectKey, String title) {
		var body = new String(client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", title))
			.exchange().expectStatus().isCreated().expectBody().returnResult().getResponseBody(),
				StandardCharsets.UTF_8);
		return JsonPath.read(body, "$.key");
	}

	private void member(String key, Person person, String role) {
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) SELECT id, :user, now() FROM projects WHERE key = :key")
			.param("user", UUID.fromString(person.id())).param("key", key).update();
		IssueRoles.give(jdbc, key, person.id(), role);
	}

	private String project(Person owner) {
		var key = "O" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
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
