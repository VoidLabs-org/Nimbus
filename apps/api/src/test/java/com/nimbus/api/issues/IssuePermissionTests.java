package com.nimbus.api.issues;

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
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class IssuePermissionTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void aViewerSeesIssuesButCannotCreateChangeOrDeleteThemOrManageStatuses() {
		var admin = register("Ada");
		var viewer = register("Vic");
		var key = project(admin);
		member(key, viewer, "viewer");
		var issue = createIssue(admin, key, "Seen");

		get(viewer, "/api/issues/" + issue).expectStatus().isOk();
		get(viewer, "/api/projects/" + key + "/issues").expectStatus().isOk();
		send(viewer, HttpMethod.POST, "/api/projects/" + key + "/issues", Map.of("type", "Story", "title", "No"))
			.expectStatus().isForbidden();
		send(viewer, HttpMethod.PATCH, "/api/issues/" + issue, Map.of("priority", "High")).expectStatus().isForbidden();
		send(viewer, HttpMethod.PUT, "/api/issues/" + issue + "/assignee", assignee(viewer)).expectStatus()
			.isForbidden();
		send(viewer, HttpMethod.DELETE, "/api/issues/" + issue, null).expectStatus().isForbidden();
		send(viewer, HttpMethod.POST, "/api/projects/" + key + "/statuses", Map.of("name", "QA", "category", "TODO"))
			.expectStatus().isForbidden();
	}

	@Test
	void aDeveloperEditsAnyIssueButDeletesOnlyTheOnesTheyReported() {
		var admin = register("Ada");
		var dev = register("Dev");
		var key = project(admin);
		member(key, dev, "developer");
		var others = createIssue(admin, key, "Not mine");
		var mine = createIssue(dev, key, "Mine");

		send(dev, HttpMethod.PATCH, "/api/issues/" + others, Map.of("priority", "High")).expectStatus().isOk();
		send(dev, HttpMethod.DELETE, "/api/issues/" + others, null).expectStatus().isForbidden();
		send(dev, HttpMethod.DELETE, "/api/issues/" + mine, null).expectStatus().isNoContent();
		send(dev, HttpMethod.POST, "/api/projects/" + key + "/statuses", Map.of("name", "QA", "category", "TODO"))
			.expectStatus().isForbidden();
	}

	@Test
	void ownEditCoversTheReporterAndTheAssigneeButNotOthers() {
		var admin = register("Ada");
		var reporter = register("Rae");
		var assignee = register("Asa");
		var other = register("Oli");
		var key = project(admin);
		for (var person : new Person[] { reporter, assignee, other }) member(key, person, "developer");
		var issue = createIssue(reporter, key, "Shared");
		send(admin, HttpMethod.PUT, "/api/issues/" + issue + "/assignee", assignee(assignee)).expectStatus().isOk();
		// A project-specific Role would be the real way; the Developer Role is narrowed for the test and restored.
		setDeveloperScope("issues:issue:edit", "OWN");
		try {
			send(reporter, HttpMethod.PATCH, "/api/issues/" + issue, Map.of("priority", "High")).expectStatus().isOk();
			send(assignee, HttpMethod.PATCH, "/api/issues/" + issue, Map.of("priority", "Low")).expectStatus().isOk();
			send(other, HttpMethod.PATCH, "/api/issues/" + issue, Map.of("priority", "Urgent")).expectStatus()
				.isForbidden();
			send(other, HttpMethod.PUT, "/api/issues/" + issue + "/assignee", assignee(other)).expectStatus()
				.isForbidden();
			// Being the Assignee never lets someone delete: Own for delete is the Reporter.
			send(assignee, HttpMethod.DELETE, "/api/issues/" + issue, null).expectStatus().isForbidden();
			send(reporter, HttpMethod.DELETE, "/api/issues/" + issue, null).expectStatus().isNoContent();
		}
		finally {
			setDeveloperScope("issues:issue:edit", "PROJECT");
		}
	}

	@Test
	void aProjectAdminManagesStatusesAndNonMembersStillGetNotFound() {
		var admin = register("Ada");
		var stranger = register("Sam");
		var key = project(admin);
		var issue = createIssue(admin, key, "Hidden");

		send(admin, HttpMethod.POST, "/api/projects/" + key + "/statuses", Map.of("name", "QA", "category", "TODO"))
			.expectStatus().isCreated();
		get(stranger, "/api/issues/" + issue).expectStatus().isNotFound();
		send(stranger, HttpMethod.PATCH, "/api/issues/" + issue, Map.of("priority", "High")).expectStatus()
			.isNotFound();
		send(stranger, HttpMethod.POST, "/api/projects/" + key + "/issues", Map.of("type", "Story", "title", "No"))
			.expectStatus().isNotFound();
	}

	@Test
	void aPlatformAdminActsInAProjectTheyAreNotIn() {
		var owner = register("Ola");
		var root = register("Root");
		var key = project(owner);
		var issue = createIssue(owner, key, "Anyones");
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), r.id, :user, NULL, now() FROM access_roles r WHERE r.key = 'platform_admin'""")
			.param("user", UUID.fromString(root.id())).update();

		get(root, "/api/issues/" + issue).expectStatus().isOk();
		send(root, HttpMethod.POST, "/api/projects/" + key + "/issues", Map.of("type", "Story", "title", "By root"))
			.expectStatus().isCreated();
		send(root, HttpMethod.PATCH, "/api/issues/" + issue, Map.of("priority", "High")).expectStatus().isOk();
		send(root, HttpMethod.POST, "/api/projects/" + key + "/statuses", Map.of("name", "QA", "category", "TODO"))
			.expectStatus().isCreated();
		send(root, HttpMethod.DELETE, "/api/issues/" + issue, null).expectStatus().isNoContent();
	}

	private void setDeveloperScope(String permission, String scope) {
		jdbc.sql("""
				UPDATE access_role_grants SET scope = :scope WHERE permission_key = :permission
				AND role_id = (SELECT id FROM access_roles WHERE key = 'developer')""")
			.param("scope", scope).param("permission", permission).update();
	}

	private Map<String, Object> assignee(Person who) {
		return Map.of("userId", who.id());
	}

	private RestTestClient.ResponseSpec get(Person who, String uri) {
		return client.get().uri(uri).header("Authorization", "Bearer " + who.token()).exchange();
	}

	private RestTestClient.ResponseSpec send(Person who, HttpMethod method, String uri, Object body) {
		var spec = client.method(method).uri(uri).header("Authorization", "Bearer " + who.token());
		return (body == null ? spec : spec.body(body)).exchange();
	}

	private void member(String key, Person person, String role) {
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) SELECT id, :user, now() FROM projects WHERE key = :key")
			.param("user", UUID.fromString(person.id())).param("key", key).update();
		IssueRoles.give(jdbc, key, person.id(), role);
	}

	private String createIssue(Person who, String projectKey, String title) {
		var body = client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", title))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.key");
	}

	private String project(Person owner) {
		var key = "P" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
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
