package com.nimbus.api.projects;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.HashMap;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/** The Members of a project: listing, adding by email, changing a project role and removing, with their rules. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
class MemberTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String email, String id) {
	}

	private Person register(String name) {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		var id = jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email).query(UUID.class).single();
		return new Person(token, email, id.toString());
	}

	private String admin() {
		var response = client.post().uri("/api/auth/login")
			.body(Map.of("email", "root@example.com", "password", "seeded password"))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(response, "$.accessToken");
	}

	private String project(Person owner) {
		var key = "M" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner.token())
			.body(Map.of("key", key, "name", "Members")).exchange().expectStatus().isCreated();
		return key;
	}

	private RestTestClient.ResponseSpec add(String token, String key, String email, String role) {
		return client.post().uri("/api/projects/{key}/members", key).header("Authorization", "Bearer " + token)
			.body(Map.of("email", email, "role", role)).exchange();
	}

	private RestTestClient.ResponseSpec change(String token, String key, String userId, String role) {
		return client.patch().uri("/api/projects/{key}/members/{id}", key, userId)
			.header("Authorization", "Bearer " + token).body(Map.of("role", role)).exchange();
	}

	private RestTestClient.ResponseSpec remove(String token, String key, String userId) {
		return client.delete().uri("/api/projects/{key}/members/{id}", key, userId)
			.header("Authorization", "Bearer " + token).exchange();
	}

	private RestTestClient.ResponseSpec members(String token, String key) {
		return client.get().uri("/api/projects/{key}/members", key).header("Authorization", "Bearer " + token)
			.exchange();
	}

	@Test
	void aMemberListsTheMembersWithTheirProjectRoles() {
		var owner = register("Olive");
		var key = project(owner);
		var bob = register("Bob");
		add(owner.token(), key, bob.email().toUpperCase(), "developer").expectStatus().isCreated().expectBody()
			.jsonPath("$.id").isEqualTo(bob.id()).jsonPath("$.email").isEqualTo(bob.email())
			.jsonPath("$.displayName").isEqualTo("Bob").jsonPath("$.role").isEqualTo("developer")
			.jsonPath("$.addedAt").isNotEmpty();

		members(bob.token(), key).expectStatus().isOk().expectBody()
			.jsonPath("$.length()").isEqualTo(2)
			.jsonPath("$[0].id").isEqualTo(owner.id()).jsonPath("$[0].role").isEqualTo("project_admin")
			.jsonPath("$[0].email").isEqualTo(owner.email())
			.jsonPath("$[1].id").isEqualTo(bob.id()).jsonPath("$[1].role").isEqualTo("developer");
		members(register("Eve").token(), key).expectStatus().isNotFound();
	}

	@Test
	void addingNeedsAKnownUserANewMemberAndAProjectRole() {
		var owner = register("Olive");
		var key = project(owner);
		var bob = register("Bob");

		add(owner.token(), key, "nobody-" + UUID.randomUUID() + "@example.com", "developer").expectStatus().isNotFound();
		add(owner.token(), key, bob.email(), "everyone").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.role").isNotEmpty();
		add(owner.token(), key, bob.email(), "no_such_role").expectStatus().isBadRequest();
		add(owner.token(), key, bob.email(), "").expectStatus().isBadRequest();
		add(owner.token(), key, "", "viewer").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.email").isNotEmpty();
		members(owner.token(), key).expectBody().jsonPath("$.length()").isEqualTo(1);

		add(owner.token(), key, bob.email(), "viewer").expectStatus().isCreated();
		add(owner.token(), key, bob.email(), "developer").expectStatus().isEqualTo(409);
		members(owner.token(), key).expectBody().jsonPath("$[1].role").isEqualTo("viewer");
	}

	@Test
	void changingARoleAndRemovingAMemberWork() {
		var owner = register("Olive");
		var key = project(owner);
		var bob = register("Bob");
		add(owner.token(), key, bob.email(), "viewer").expectStatus().isCreated();

		change(owner.token(), key, bob.id(), "developer").expectStatus().isOk().expectBody()
			.jsonPath("$.role").isEqualTo("developer");
		change(owner.token(), key, bob.id(), "everyone").expectStatus().isBadRequest();
		change(owner.token(), key, UUID.randomUUID().toString(), "viewer").expectStatus().isNotFound();
		remove(owner.token(), key, bob.id()).expectStatus().isNoContent();
		remove(owner.token(), key, bob.id()).expectStatus().isNotFound();

		members(owner.token(), key).expectBody().jsonPath("$.length()").isEqualTo(1);
		client.get().uri("/api/projects/{key}", key).header("Authorization", "Bearer " + bob.token()).exchange()
			.expectStatus().isNotFound();
		assertThat(jdbc.sql("SELECT COUNT(*) FROM access_role_assignments WHERE user_id = :id")
			.param("id", UUID.fromString(bob.id())).query(Long.class).single()).isZero();
	}

	@Test
	void changesNeedProjectsMemberManage() {
		var owner = register("Olive");
		var key = project(owner);
		var dev = register("Dev");
		var other = register("Other");
		add(owner.token(), key, dev.email(), "developer").expectStatus().isCreated();

		add(dev.token(), key, other.email(), "viewer").expectStatus().isForbidden();
		change(dev.token(), key, owner.id(), "viewer").expectStatus().isForbidden();
		remove(dev.token(), key, owner.id()).expectStatus().isForbidden();
		add(other.token(), key, dev.email(), "viewer").expectStatus().isNotFound();
		client.post().uri("/api/projects/{key}/members", key).body(Map.of("email", other.email(), "role", "viewer"))
			.exchange().expectStatus().isUnauthorized();
		members(owner.token(), key).expectBody().jsonPath("$.length()").isEqualTo(2);
	}

	@Test
	void theLastProjectAdminCanNotBeDemotedOrRemoved() {
		var owner = register("Olive");
		var key = project(owner);
		var second = register("Second");
		var admin = admin();
		add(owner.token(), key, second.email(), "project_admin").expectStatus().isCreated();

		// Two admins: one may go.
		change(owner.token(), key, second.id(), "developer").expectStatus().isOk();
		// One left: not even a Platform admin may take them away.
		change(admin, key, owner.id(), "developer").expectStatus().isEqualTo(409);
		remove(admin, key, owner.id()).expectStatus().isEqualTo(409);
		change(admin, key, owner.id(), "project_admin").expectStatus().isOk();

		members(owner.token(), key).expectBody().jsonPath("$[0].role").isEqualTo("project_admin");
	}

	@Test
	void concurrentDemotionsOfTheTwoAdminsLeaveOne() throws Exception {
		var owner = register("Olive");
		var key = project(owner);
		var second = register("Second");
		var admin = admin();
		add(owner.token(), key, second.email(), "project_admin").expectStatus().isCreated();

		try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
			var one = pool.submit(() -> change(admin, key, owner.id(), "viewer").returnResult().getStatus().value());
			var two = pool.submit(() -> change(admin, key, second.id(), "viewer").returnResult().getStatus().value());
			assertThat(List.of(one.get(), two.get())).containsExactlyInAnyOrder(200, 409);
		}
		assertThat(jdbc.sql("""
				SELECT COUNT(*) FROM access_role_assignments a JOIN access_roles r ON r.id = a.role_id
				JOIN projects p ON p.id = a.project_id WHERE p.key = :key AND r.key = 'project_admin'""")
			.param("key", key).query(Long.class).single()).isEqualTo(1);
	}

	@Test
	void aManagerCanOnlyGiveRolesWithinTheirOwnAccess() {
		var owner = register("Olive");
		var key = project(owner);
		var admin = admin();
		var role = "manager_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
		client.post().uri("/api/access/roles").header("Authorization", "Bearer " + admin)
			.body(Map.of("key", role, "name", "Manager", "description", "", "kind", "project")).exchange()
			.expectStatus().isCreated();
		var version = JsonPath.<Integer>read(new String(client.get().uri("/api/access/roles/{key}", role)
			.header("Authorization", "Bearer " + admin).exchange().expectBody().returnResult().getResponseBody()),
				"$.version");
		var grant = new HashMap<String, Object>();
		grant.put("permission", "projects:member:manage");
		grant.put("scope", "project");
		client.put().uri("/api/access/roles/{key}/grants", role).header("Authorization", "Bearer " + admin)
			.body(Map.of("grants", List.of(grant), "version", version)).exchange().expectStatus().isOk();
		var manager = register("Manager");
		var other = register("Other");
		add(owner.token(), key, manager.email(), role).expectStatus().isCreated();

		add(manager.token(), key, other.email(), "project_admin").expectStatus().isForbidden();
		add(manager.token(), key, other.email(), "developer").expectStatus().isForbidden();
		add(manager.token(), key, other.email(), role).expectStatus().isCreated();
		client.get().uri("/api/projects/{key}/member-roles", key).header("Authorization", "Bearer " + manager.token())
			.exchange().expectStatus().isOk().expectBody()
			.jsonPath("$[?(@.key=='project_admin')].assignable").isEqualTo(false)
			.jsonPath("$[?(@.key=='" + role + "')].assignable").isEqualTo(true);
		// A Project admin has everything a project role grants.
		add(owner.token(), key, register("Third").email(), "developer").expectStatus().isCreated();
	}

	@Test
	void nobodyChangesTheirOwnRoleOrMembership() {
		var owner = register("Olive");
		var key = project(owner);
		var second = register("Second");
		add(owner.token(), key, second.email(), "project_admin").expectStatus().isCreated();

		change(owner.token(), key, owner.id(), "developer").expectStatus().isForbidden();
		remove(owner.token(), key, owner.id()).expectStatus().isForbidden();
		change(second.token(), key, second.id(), "viewer").expectStatus().isForbidden();
		members(owner.token(), key).expectBody().jsonPath("$[0].role").isEqualTo("project_admin");
	}

	@Test
	void anArchivedProjectKeepsItsMembers() {
		var owner = register("Olive");
		var key = project(owner);
		var bob = register("Bob");
		add(owner.token(), key, bob.email(), "viewer").expectStatus().isCreated();
		client.post().uri("/api/projects/{key}/archive", key).header("Authorization", "Bearer " + owner.token())
			.exchange().expectStatus().isOk();

		add(owner.token(), key, register("Eve").email(), "viewer").expectStatus().isEqualTo(409);
		change(owner.token(), key, bob.id(), "developer").expectStatus().isEqualTo(409);
		remove(owner.token(), key, bob.id()).expectStatus().isEqualTo(409);
		members(owner.token(), key).expectBody().jsonPath("$.length()").isEqualTo(2);
	}

	@Test
	void everyChangeIsAudited() {
		var owner = register("Olive");
		var key = project(owner);
		var bob = register("Bob");
		add(owner.token(), key, bob.email(), "viewer").expectStatus().isCreated();
		change(owner.token(), key, bob.id(), "developer").expectStatus().isOk();
		remove(owner.token(), key, bob.id()).expectStatus().isNoContent();
		change(owner.token(), key, bob.id(), "viewer").expectStatus().isNotFound();

		var projectId = jdbc.sql("SELECT id FROM projects WHERE key = :key").param("key", key).query(UUID.class)
			.single();
		var entries = jdbc.sql("""
				SELECT action, actor_id, before::text AS before, after::text AS after FROM access_audit_entries
				WHERE target_type = 'project_member' AND target_key = :target ORDER BY seq""")
			.param("target", projectId + "/" + bob.id())
			.query((rs, n) -> Map.of("action", rs.getString("action"), "actor", rs.getObject("actor_id", UUID.class),
					"before", String.valueOf(rs.getString("before")), "after", String.valueOf(rs.getString("after"))))
			.list();
		assertThat(entries).extracting(entry -> entry.get("action"))
			.containsExactly("member.added", "member.role_changed", "member.removed");
		assertThat(entries).extracting(entry -> entry.get("actor")).containsOnly(UUID.fromString(owner.id()));
		assertThat(String.valueOf(entries.get(1).get("before"))).contains("viewer");
		assertThat(String.valueOf(entries.get(1).get("after"))).contains("developer");
	}

	@Test
	void removingAMemberUnassignsTheirIssuesInThatProject() {
		var owner = register("Olive");
		var key = project(owner);
		var other = project(owner);
		var bob = register("Bob");
		add(owner.token(), key, bob.email(), "developer").expectStatus().isCreated();
		add(owner.token(), other, bob.email(), "developer").expectStatus().isCreated();
		var mine = issue(owner, key, bob.id());
		var elsewhere = issue(owner, other, bob.id());

		remove(owner.token(), key, bob.id()).expectStatus().isNoContent();

		await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
			client.get().uri("/api/issues/{key}", mine).header("Authorization", "Bearer " + owner.token()).exchange()
				.expectStatus().isOk().expectBody().jsonPath("$.assignee").isEmpty();
		});
		client.get().uri("/api/issues/{key}", elsewhere).header("Authorization", "Bearer " + owner.token()).exchange()
			.expectBody().jsonPath("$.assignee.id").isEqualTo(bob.id());
	}

	private String issue(Person who, String projectKey, String assignee) {
		var response = client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token())
			.body(Map.of("type", "Chore", "title", "Assigned", "assigneeId", assignee)).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(response, "$.key");
	}
}
