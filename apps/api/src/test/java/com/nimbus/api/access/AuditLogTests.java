package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Every change to Roles leaves an entry that holders of access:audit:view can read, newest first. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
class AuditLogTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	String admin;

	@BeforeEach
	void signInAsAdmin() {
		admin = signIn("root@example.com", "seeded password");
	}

	@Test
	void eachChangeToARoleIsRecordedWithWhoDidItAndBeforeAndAfter() {
		post("/api/access/roles", Map.of("key", "audited", "name", "Audited", "description", "", "kind", "project"));
		send("PATCH", "/api/access/roles/audited", Map.of("name", "Audited role", "version", version("audited")));
		send("PUT", "/api/access/roles/audited/grants",
				Map.of("grants", List.of(Map.of("permission", "projects:project:update", "scope", "project")), "version",
						version("audited")));
		send("DELETE", "/api/access/roles/audited", null);

		var entries = entriesAbout("audited");

		// Newest first.
		assertThat(entries).extracting(entry -> (String) entry.get("action"))
			.containsExactly("role.deleted", "role.grants_changed", "role.renamed", "role.created");
		var renamed = entries.get(2);
		assertThat(JsonPath.<String>read(renamed, "$.actor.email")).isEqualTo("root@example.com");
		assertThat(JsonPath.<String>read(renamed, "$.before.name")).isEqualTo("Audited");
		assertThat(JsonPath.<String>read(renamed, "$.after.name")).isEqualTo("Audited role");
		var granted = entries.get(1);
		assertThat(JsonPath.<Map<String, Object>>read(granted, "$.before.grants")).isEmpty();
		assertThat(JsonPath.<String>read(granted, "$.after.grants['projects:project:update']")).isEqualTo("project");
		assertThat(JsonPath.<Object>read(entries.get(0), "$.after")).isNull();
		assertThat(JsonPath.<String>read(entries.get(3), "$.target.key")).isEqualTo("audited");
	}

	@Test
	void aResetIsRecorded() {
		send("PATCH", "/api/access/roles/viewer", Map.of("description", "Edited", "version", version("viewer")));
		send("POST", "/api/access/roles/viewer/reset", Map.of("version", version("viewer")));

		assertThat(entriesAbout("viewer")).extracting(entry -> (String) entry.get("action"))
			.startsWith("role.reset", "role.described");
	}

	@Test
	void aRefusedChangeLeavesNoEntry() {
		post("/api/access/roles", Map.of("key", "contested", "name", "Contested", "description", "", "kind", "project"));
		var opened = version("contested");
		send("PATCH", "/api/access/roles/contested", Map.of("name", "First", "version", opened));

		client.patch().uri("/api/access/roles/contested")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("name", "Second", "version", opened))
			.exchange()
			.expectStatus().isEqualTo(409);

		assertThat(entriesAbout("contested")).extracting(entry -> (String) entry.get("action"))
			.containsExactly("role.renamed", "role.created");
	}

	@Test
	void aSaveThatChangesNothingLeavesNoEntryAndADescriptionOnlyEditIsDescribed() {
		post("/api/access/roles", Map.of("key", "steady", "name", "Steady", "description", "Same", "kind", "project"));
		var opened = version("steady");

		send("PATCH", "/api/access/roles/steady", Map.of("name", "Steady", "description", "Same", "version", opened));
		assertThat(version("steady")).isEqualTo(opened);

		send("PATCH", "/api/access/roles/steady", Map.of("description", "Different", "version", opened));

		assertThat(entriesAbout("steady")).extracting(entry -> (String) entry.get("action"))
			.containsExactly("role.described", "role.created");
	}

	@Test
	void pagesStayTheSameWhileNewEntriesArrive() {
		for (var i = 0; i < 3; i++) {
			post("/api/access/roles", Map.of("key", "stable_" + i, "name", "Stable", "description", "", "kind", "project"));
		}
		var first = read("/api/access/audit?page=0&size=2");
		long asOf = ((Number) JsonPath.read(first, "$.asOf")).longValue();
		post("/api/access/roles", Map.of("key", "arrived_later", "name", "Later", "description", "", "kind", "project"));

		var second = read("/api/access/audit?page=1&size=2&asOf=" + asOf);

		List<String> firstIds = JsonPath.read(first, "$.entries[*].id");
		List<String> secondIds = JsonPath.read(second, "$.entries[*].id");
		assertThat(secondIds).doesNotContainAnyElementsOf(firstIds);
		assertThat(JsonPath.<Integer>read(second, "$.total")).isEqualTo(JsonPath.<Integer>read(first, "$.total"));
		assertThat(JsonPath.<List<String>>read(second, "$.entries[*].target.key")).doesNotContain("arrived_later");
	}

	@Test
	void invalidPagingIsRefusedNotACrash() {
		for (var query : List.of("page=-1", "size=0", "size=101", "asOf=-5")) {
			client.get().uri("/api/access/audit?" + query)
				.header("Authorization", "Bearer " + admin)
				.exchange()
				.expectStatus().isBadRequest();
		}
	}

	@Test
	void anEntryShowsItsActorsPictureAndNoneForAUserWhoNoLongerExists() {
		jdbc.sql("UPDATE users SET avatar_url = 'https://img/root.png' WHERE email = 'root@example.com'").update();
		post("/api/access/roles", Map.of("key", "pictured", "name", "Pictured", "description", "", "kind", "project"));
		var gone = java.util.UUID.randomUUID();
		jdbc.sql("""
				INSERT INTO access_audit_entries (id, at, actor_id, action, target_type, target_key)
				VALUES (gen_random_uuid(), now(), :actor, 'role.created', 'role', 'by_a_ghost')
				""").param("actor", gone).update();

		var actor = JsonPath.<Map<String, Object>>read(entriesAbout("pictured").get(0), "$.actor");
		assertThat(actor.get("email")).isEqualTo("root@example.com");
		assertThat(actor.get("avatarUrl")).isEqualTo("https://img/root.png");
		assertThat(actor.get("displayName")).isNotIn("root@example.com", "https://img/root.png");

		var ghost = JsonPath.<Map<String, Object>>read(entriesAbout("by_a_ghost").get(0), "$.actor");
		assertThat(ghost.get("id")).isEqualTo(gone.toString());
		assertThat(ghost.get("avatarUrl")).isNull();
		assertThat(ghost.get("email")).isNull();
	}

	@Test
	void anEntrySaysWhetherItsRoleStillExists() {
		post("/api/access/roles", Map.of("key", "short_lived", "name", "Short", "description", "", "kind", "project"));
		post("/api/access/roles", Map.of("key", "long_lived", "name", "Long", "description", "", "kind", "project"));
		send("DELETE", "/api/access/roles/short_lived", null);

		assertThat(entriesAbout("short_lived")).extracting(entry -> JsonPath.<Boolean>read(entry, "$.target.exists"))
			.containsOnly(false);
		assertThat(entriesAbout("long_lived")).extracting(entry -> JsonPath.<Boolean>read(entry, "$.target.exists"))
			.containsOnly(true);
	}

	@Test
	void anEntryCanNeverBeEditedOrDeleted() {
		post("/api/access/roles", Map.of("key", "kept", "name", "Kept", "description", "", "kind", "platform"));

		assertThatThrownBy(() -> jdbc.sql("UPDATE access_audit_entries SET action = 'nothing' WHERE target_key = 'kept'")
			.update()).hasMessageContaining("append-only");
		assertThatThrownBy(() -> jdbc.sql("DELETE FROM access_audit_entries WHERE target_key = 'kept'").update())
			.hasMessageContaining("append-only");
	}

	@Test
	void anAuditorReadsTheLogWithoutBeingAbleToChangeRoles() {
		post("/api/access/roles", Map.of("key", "auditors", "name", "Auditors", "description", "", "kind", "platform"));
		send("PUT", "/api/access/roles/auditors/grants",
				Map.of("grants", List.of(grant("access:audit:view", null)), "version", version("auditors")));
		var auditor = register("audrey@example.com");
		// Nothing can give out platform roles yet (#47), so the assignment is set up directly.
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), r.id, u.id, NULL, now() FROM access_roles r, users u
				WHERE r.key = 'auditors' AND u.email = 'audrey@example.com'""")
			.update();

		client.get().uri("/api/access/audit").header("Authorization", "Bearer " + auditor).exchange()
			.expectStatus().isOk();
		client.get().uri("/api/access/roles").header("Authorization", "Bearer " + auditor).exchange()
			.expectStatus().isForbidden();
	}

	@Test
	void anyoneElseIsRefused() {
		client.get().uri("/api/access/audit")
			.header("Authorization", "Bearer " + register("nosy@example.com"))
			.exchange()
			.expectStatus().isForbidden();
		client.get().uri("/api/access/audit").exchange().expectStatus().isUnauthorized();
	}

	@Test
	void theLogIsPaged() {
		for (var i = 0; i < 3; i++) {
			post("/api/access/roles", Map.of("key", "paged_" + i, "name", "Paged", "description", "", "kind", "project"));
		}

		var first = read("/api/access/audit?page=0&size=2");
		var second = read("/api/access/audit?page=1&size=2");

		assertThat(JsonPath.<List<?>>read(first, "$.entries")).hasSize(2);
		assertThat(JsonPath.<Integer>read(first, "$.total")).isGreaterThanOrEqualTo(3);
		assertThat(JsonPath.<String>read(first, "$.entries[0].id")).isNotEqualTo(JsonPath.read(second, "$.entries[0].id"));
	}

	private List<Map<String, Object>> entriesAbout(String roleKey) {
		return JsonPath.read(read("/api/access/audit?size=100"), "$.entries[?(@.target.key == '" + roleKey + "')]");
	}

	private String read(String uri) {
		return client.get().uri(uri)
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private int version(String key) {
		return JsonPath.read(read("/api/access/roles/" + key), "$.version");
	}

	private void post(String uri, Map<String, Object> body) {
		send("POST", uri, body);
	}

	private void send(String method, String uri, Map<String, Object> body) {
		var request = client.method(org.springframework.http.HttpMethod.valueOf(method)).uri(uri)
			.header("Authorization", "Bearer " + admin);
		(body == null ? request : request.body(body)).exchange().expectStatus().is2xxSuccessful();
	}

	private static Map<String, Object> grant(String permission, String scope) {
		var grant = new HashMap<String, Object>();
		grant.put("permission", permission);
		grant.put("scope", scope);
		return grant;
	}

	private String register(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

	private String signIn(String email, String password) {
		var response = client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", password))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(response, "$.accessToken");
	}

}
