package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
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
class ManageStatusesTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void aStatusIsAddedToACategoryAfterItsLastStatusAndPositionsStayDense() {
		var dana = register("Dana");
		var key = project(dana);

		add(dana, key, "In review", "IN_PROGRESS").expectStatus().isCreated().expectBody()
			.jsonPath("$.name").isEqualTo("In review").jsonPath("$.category").isEqualTo("IN_PROGRESS")
			.jsonPath("$.position").isEqualTo(2);
		add(dana, key, "  QA  ", "DONE").expectStatus().isCreated().expectBody().jsonPath("$.name").isEqualTo("QA");

		var list = list(dana, key);
		assertThat(names(list)).containsExactly("To do", "In progress", "In review", "Done", "QA");
		assertThat((List<Integer>) JsonPath.read(list, "$[*].position")).containsExactly(0, 1, 2, 3, 4);
	}

	@Test
	void namesAreOneToThirtyCharactersUniqueIgnoringCaseAndCategoriesMustBeKnown() {
		var dana = register("Dana");
		var key = project(dana);

		add(dana, key, "", "TODO").expectStatus().isBadRequest().expectBody().jsonPath("$.errors.name").exists();
		add(dana, key, "x".repeat(31), "TODO").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.name").exists();
		add(dana, key, "Bad\nname", "TODO").expectStatus().isBadRequest();
		add(dana, key, "x".repeat(30), "TODO").expectStatus().isCreated();
		add(dana, key, "Fine", "BLOCKED").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.category").exists();
		client.post().uri("/api/projects/{key}/statuses", key).header("Authorization", "Bearer " + dana.token())
			.body(Map.of("name", "No category")).exchange().expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.category").exists();

		add(dana, key, "to DO", "TODO").expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("status_name_taken");
		// Another project may use the same names.
		var other = project(dana);
		add(dana, other, "to do", "TODO").expectStatus().isEqualTo(409);
		add(dana, other, "Review", "TODO").expectStatus().isCreated();
		add(dana, other, "review", "TODO").expectStatus().isEqualTo(409);
	}

	@Test
	void aProjectHoldsAtMostTwentyStatuses() {
		var dana = register("Dana");
		var key = project(dana);
		for (int i = 0; i < 17; i++) add(dana, key, "Extra " + i, "IN_PROGRESS").expectStatus().isCreated();
		assertThat(names(list(dana, key))).hasSize(20);

		add(dana, key, "One too many", "TODO").expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("status_limit");
		assertThat(names(list(dana, key))).hasSize(20);
	}

	@Test
	void renamingKeepsTheIdAndIssuesStayWhereTheyAre() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);
		var todo = statusId(dana, key, "To do");

		patch(dana, key, todo, Map.of("name", "Backlog")).expectStatus().isOk().expectBody()
			.jsonPath("$.id").isEqualTo(todo).jsonPath("$.name").isEqualTo("Backlog")
			.jsonPath("$.category").isEqualTo("TODO");
		// Only the letter case of its own name changes: allowed.
		patch(dana, key, todo, Map.of("name", "BACKLOG")).expectStatus().isOk();
		patch(dana, key, todo, Map.of("name", "done")).expectStatus().isEqualTo(409);
		patch(dana, key, todo, Map.of("name", " ")).expectStatus().isBadRequest();
		patch(dana, key, todo, Map.of("category", "NOPE")).expectStatus().isBadRequest();

		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.id").isEqualTo(todo).jsonPath("$.status.name").isEqualTo("BACKLOG");
		patch(dana, key, UUID.randomUUID().toString(), Map.of("name", "Ghost")).expectStatus().isNotFound();
	}

	@Test
	void aCategoryChangeIsRefusedWhenItWouldLeaveACategoryEmpty() {
		var dana = register("Dana");
		var key = project(dana);
		createIssue(dana, key);
		var todo = statusId(dana, key, "To do");
		var progress = statusId(dana, key, "In progress");

		patch(dana, key, todo, Map.of("category", "DONE")).expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("category_needs_status");
		assertThat((List<String>) JsonPath.read(list(dana, key), "$[*].category"))
			.containsExactly("TODO", "IN_PROGRESS", "DONE");

		add(dana, key, "Second to do", "TODO").expectStatus().isCreated();
		patch(dana, key, todo, Map.of("category", "IN_PROGRESS")).expectStatus().isOk().expectBody()
			.jsonPath("$.category").isEqualTo("IN_PROGRESS").jsonPath("$.position").isEqualTo(0);
		// The category change alone moves nothing; and the same category again is a no-op.
		patch(dana, key, progress, Map.of("category", "IN_PROGRESS")).expectStatus().isOk();
		assertThat(names(list(dana, key))).containsExactly("To do", "Second to do", "In progress", "Done");
	}

	@Test
	void theOrderIsSetWithAllOfTheProjectsStatuses() {
		var dana = register("Dana");
		var key = project(dana);
		createIssue(dana, key);
		var todo = statusId(dana, key, "To do");
		var progress = statusId(dana, key, "In progress");
		var done = statusId(dana, key, "Done");

		order(dana, key, List.of(done, todo, progress)).expectStatus().isOk().expectBody()
			.jsonPath("$[0].name").isEqualTo("Done").jsonPath("$[0].position").isEqualTo(0)
			.jsonPath("$[2].name").isEqualTo("In progress").jsonPath("$[2].position").isEqualTo(2);
		assertThat(names(list(dana, key))).containsExactly("Done", "To do", "In progress");

		// A missing, repeated or foreign id is refused and nothing changes.
		order(dana, key, List.of(done, todo)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.statusIds").exists();
		order(dana, key, List.of(done, done, todo)).expectStatus().isBadRequest();
		order(dana, key, List.of(done, todo, UUID.randomUUID().toString())).expectStatus().isBadRequest();
		client.put().uri("/api/projects/{key}/statuses/order", key).header("Authorization", "Bearer " + dana.token())
			.body(Map.of()).exchange().expectStatus().isBadRequest();
		order(dana, key, List.of("not-an-id")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.statusIds").exists();
		assertThat(names(list(dana, key))).containsExactly("Done", "To do", "In progress");
	}

	@Test
	void newIssuesStartInTheFirstToDoStatusInTheNewOrder() {
		var dana = register("Dana");
		var key = project(dana);
		add(dana, key, "Triage", "TODO").expectStatus().isCreated();
		var todo = statusId(dana, key, "To do");
		var triage = statusId(dana, key, "Triage");
		var progress = statusId(dana, key, "In progress");
		var done = statusId(dana, key, "Done");

		order(dana, key, List.of(triage, todo, progress, done)).expectStatus().isOk();
		var issue = createIssue(dana, key);
		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.name").isEqualTo("Triage");
	}

	@Test
	void deletingAnEmptyStatusNeedsNoMoveToAndKeepsPositionsDense() {
		var dana = register("Dana");
		var key = project(dana);
		add(dana, key, "In review", "IN_PROGRESS").expectStatus().isCreated();
		var review = statusId(dana, key, "In review");

		delete(dana, key, review, null).expectStatus().isNoContent();
		var list = list(dana, key);
		assertThat(names(list)).containsExactly("To do", "In progress", "Done");
		assertThat((List<Integer>) JsonPath.read(list, "$[*].position")).containsExactly(0, 1, 2);
		delete(dana, key, review, null).expectStatus().isNotFound();
	}

	@Test
	void deletingAStatusWithIssuesMovesThemWithHistoryAndOneEventEach() {
		var dana = register("Dana");
		var key = project(dana);
		add(dana, key, "In review", "IN_PROGRESS").expectStatus().isCreated();
		var review = statusId(dana, key, "In review");
		var done = statusId(dana, key, "Done");
		var first = createIssue(dana, key);
		var second = createIssue(dana, key);
		var untouched = createIssue(dana, key);
		move(dana, first, review);
		move(dana, second, review);

		// Without a destination the delete is refused and nothing changes.
		delete(dana, key, review, null).expectStatus().isBadRequest().expectBody().jsonPath("$.errors.moveTo").exists();
		assertThat(names(list(dana, key))).contains("In review");

		delete(dana, key, review, done).expectStatus().isNoContent();
		assertThat(names(list(dana, key))).doesNotContain("In review");
		for (var moved : List.of(first, second)) {
			client.get().uri("/api/issues/{key}", moved).header("Authorization", "Bearer " + dana.token()).exchange()
				.expectBody().jsonPath("$.status.name").isEqualTo("Done");
			var history = new String(client.get().uri("/api/issues/{key}/history", moved)
				.header("Authorization", "Bearer " + dana.token()).exchange().expectStatus().isOk().expectBody()
				.returnResult().getResponseBody());
			assertThat((String) JsonPath.read(history, "$[0].field")).isEqualTo("status");
			assertThat((String) JsonPath.read(history, "$[0].before")).isEqualTo("In review");
			assertThat((String) JsonPath.read(history, "$[0].after")).isEqualTo("Done");
			assertThat((String) JsonPath.read(history, "$[0].actor.displayName")).isEqualTo("Dana");
		}
		client.get().uri("/api/issues/{key}", untouched).header("Authorization", "Bearer " + dana.token())
			.exchange().expectBody().jsonPath("$.status.name").isEqualTo("To do");
		assertThat(jdbc.sql("SELECT count(*) FROM issue_history WHERE field = 'status' AND before_value = 'In review'")
			.query(Long.class).single()).isGreaterThanOrEqualTo(2);
	}

	@Test
	void aDeleteThatWouldEmptyACategoryOrMoveToAnInvalidStatusIsRefused() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);
		var todo = statusId(dana, key, "To do");
		var progress = statusId(dana, key, "In progress");
		var otherKey = project(dana);
		createIssue(dana, otherKey);
		var foreign = statusId(dana, otherKey, "Done");

		// The only status of a category cannot go, even with a destination.
		delete(dana, key, todo, progress).expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("category_needs_status");
		add(dana, key, "Second to do", "TODO").expectStatus().isCreated();
		delete(dana, key, todo, todo).expectStatus().isBadRequest().expectBody().jsonPath("$.errors.moveTo").exists();
		delete(dana, key, todo, foreign).expectStatus().isBadRequest();
		delete(dana, key, todo, UUID.randomUUID().toString()).expectStatus().isBadRequest();
		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.name").isEqualTo("To do");

		delete(dana, key, todo, progress).expectStatus().isNoContent();
		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.name").isEqualTo("In progress");
	}

	@Test
	void anArchivedProjectRefusesEveryChange() {
		var dana = register("Dana");
		var key = project(dana);
		createIssue(dana, key);
		var todo = statusId(dana, key, "To do");
		var progress = statusId(dana, key, "In progress");
		var done = statusId(dana, key, "Done");
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();

		add(dana, key, "New", "TODO").expectStatus().isEqualTo(409);
		patch(dana, key, todo, Map.of("name", "Renamed")).expectStatus().isEqualTo(409);
		order(dana, key, List.of(done, progress, todo)).expectStatus().isEqualTo(409);
		delete(dana, key, todo, progress).expectStatus().isEqualTo(409);
		assertThat(names(list(dana, key))).containsExactly("To do", "In progress", "Done");
	}

	@Test
	void nonMembersGetNotFoundAndAnonymousCallersGetUnauthorized() {
		var dana = register("Dana");
		var lee = register("Lee");
		var key = project(dana);
		createIssue(dana, key);
		var todo = statusId(dana, key, "To do");
		var progress = statusId(dana, key, "In progress");

		add(lee, key, "Sneaky", "TODO").expectStatus().isNotFound();
		patch(lee, key, todo, Map.of("name", "Sneaky")).expectStatus().isNotFound();
		order(lee, key, List.of(todo, progress)).expectStatus().isNotFound();
		delete(lee, key, todo, progress).expectStatus().isNotFound();
		add(dana, "NOPE", "Nothing", "TODO").expectStatus().isNotFound();
		assertThat(names(list(dana, key))).containsExactly("To do", "In progress", "Done");

		client.post().uri("/api/projects/{key}/statuses", key).body(Map.of("name", "A", "category", "TODO"))
			.exchange().expectStatus().isUnauthorized();
		client.patch().uri("/api/projects/{key}/statuses/{id}", key, todo).body(Map.of("name", "A")).exchange()
			.expectStatus().isUnauthorized();
		client.put().uri("/api/projects/{key}/statuses/order", key).body(Map.of("statusIds", List.of(todo)))
			.exchange().expectStatus().isUnauthorized();
		client.delete().uri("/api/projects/{key}/statuses/{id}", key, todo).exchange().expectStatus().isUnauthorized();
	}

	@Test
	void aProjectWithoutIssuesGetsItsDefaultStatusesBeforeTheFirstChange() {
		var dana = register("Dana");
		var key = project(dana);
		assertThat(names(list(dana, key))).isEmpty();

		add(dana, key, "Triage", "TODO").expectStatus().isCreated();
		assertThat(names(list(dana, key))).containsExactly("To do", "Triage", "In progress", "Done");
	}

	@Test
	void concurrentAddsNeverExceedTheLimitOrRepeatAPosition() throws Exception {
		var dana = register("Dana");
		var key = project(dana);
		add(dana, key, "Seed", "TODO").expectStatus().isCreated();
		for (int i = 0; i < 13; i++) add(dana, key, "Fill " + i, "IN_PROGRESS").expectStatus().isCreated();

		var codes = new ArrayList<Integer>();
		var threads = new ArrayList<Thread>();
		for (int i = 0; i < 8; i++) {
			var name = "Racer " + i;
			var thread = new Thread(() -> {
				var status = add(dana, key, name, "DONE").expectBody(String.class).returnResult().getStatus().value();
				synchronized (codes) {
					codes.add(status);
				}
			});
			threads.add(thread);
			thread.start();
		}
		for (var thread : threads) thread.join();

		var list = list(dana, key);
		assertThat(names(list)).hasSize(20);
		assertThat(codes.stream().filter(code -> code == 201)).hasSize(3);
		assertThat(codes.stream().filter(code -> code == 409)).hasSize(5);
		assertThat((List<Integer>) JsonPath.read(list, "$[*].position")).containsExactlyElementsOf(
				java.util.stream.IntStream.range(0, 20).boxed().toList());
	}

	private List<String> names(String list) {
		return JsonPath.read(list, "$[*].name");
	}

	private String list(Person who, String projectKey) {
		return new String(client.get().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk().expectBody()
			.returnResult().getResponseBody());
	}

	private String statusId(Person who, String projectKey, String name) {
		return ((List<String>) JsonPath.read(list(who, projectKey), "$[?(@.name=='" + name + "')].id")).getFirst();
	}

	private RestTestClient.ResponseSpec add(Person who, String projectKey, String name, String category) {
		return client.post().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("name", name, "category", category))
			.exchange();
	}

	private RestTestClient.ResponseSpec patch(Person who, String projectKey, String statusId, Map<String, ?> body) {
		return client.patch().uri("/api/projects/{key}/statuses/{id}", projectKey, statusId)
			.header("Authorization", "Bearer " + who.token()).body(body).exchange();
	}

	private RestTestClient.ResponseSpec order(Person who, String projectKey, List<String> ids) {
		return client.put().uri("/api/projects/{key}/statuses/order", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("statusIds", ids)).exchange();
	}

	private RestTestClient.ResponseSpec delete(Person who, String projectKey, String statusId, String moveTo) {
		return client.delete().uri(moveTo == null ? "/api/projects/{key}/statuses/{id}"
				: "/api/projects/{key}/statuses/{id}?moveTo=" + moveTo, projectKey, statusId)
			.header("Authorization", "Bearer " + who.token()).exchange();
	}

	private void move(Person who, String issueKey, String statusId) {
		client.put().uri("/api/issues/{key}/status", issueKey).header("Authorization", "Bearer " + who.token())
			.body(Map.of("statusId", statusId)).exchange().expectStatus().isOk();
	}

	private String createIssue(Person who, String projectKey) {
		var body = client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", "Original"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.key");
	}

	private String project(Person owner) {
		var key = "S" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner.token())
			.body(Map.of("key", key, "name", "Project " + key)).exchange().expectStatus().isCreated();
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
