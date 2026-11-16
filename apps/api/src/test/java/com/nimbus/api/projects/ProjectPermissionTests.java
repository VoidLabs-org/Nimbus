package com.nimbus.api.projects;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.access.ProjectRoles;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Projects obey the Permissions {@code access} holds: creating, changing, archiving, seeing and listing. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProjectPermissionTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ProjectRoles roles;

	@Autowired
	Projects projects;

	record Person(String token, String id) {
	}

	@Test
	void theCreatorBecomesProjectAdmin() {
		var dana = register("Dana");
		var key = create(dana);

		var project = projects.findByKey(key).orElseThrow();
		assertThat(roles.roleOf(project.id(), UUID.fromString(dana.id()))).contains("project_admin");
		send(dana, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "Renamed")).expectStatus().isOk();
		send(dana, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isOk();
		send(dana, HttpMethod.POST, "/api/projects/" + key + "/restore", null).expectStatus().isOk();
	}

	@Test
	void creatingNeedsThePermissionEveryoneHasByDefault() {
		var dana = register("Dana");
		revoke("everyone", "projects:project:create");
		try {
			send(dana, HttpMethod.POST, "/api/projects", Map.of("key", newKey(), "name", "Denied")).expectStatus()
				.isForbidden();
		}
		finally {
			jdbc.sql("""
					INSERT INTO access_role_grants (role_id, permission_key, scope)
					SELECT id, 'projects:project:create', NULL FROM access_roles WHERE key = 'everyone'""").update();
		}
		send(dana, HttpMethod.POST, "/api/projects", Map.of("key", newKey(), "name", "Allowed")).expectStatus()
			.isCreated();
	}

	@Test
	void aMemberWithoutUpdateOrArchiveGetsForbidden() {
		var admin = register("Ada");
		var viewer = register("Vic");
		var key = create(admin);
		member(key, viewer, "viewer");

		get(viewer, "/api/projects/" + key).expectStatus().isOk();
		send(viewer, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "No")).expectStatus().isForbidden();
		send(viewer, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isForbidden();
		send(admin, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isOk();
		send(viewer, HttpMethod.POST, "/api/projects/" + key + "/restore", null).expectStatus().isForbidden();
	}

	@Test
	void eachPermissionAloneAllowsOnlyItsOwnActions() {
		var admin = register("Ada");
		var dev = register("Dev");
		var key = create(admin);
		member(key, dev, "developer");

		grant("developer", "projects:project:update", "PROJECT");
		try {
			send(dev, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "Dev edit")).expectStatus().isOk();
			send(dev, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isForbidden();
		}
		finally {
			revoke("developer", "projects:project:update");
		}
		grant("developer", "projects:project:archive", "PROJECT");
		try {
			send(dev, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isOk();
			send(dev, HttpMethod.POST, "/api/projects/" + key + "/restore", null).expectStatus().isOk();
			send(dev, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "Nope")).expectStatus().isForbidden();
		}
		finally {
			revoke("developer", "projects:project:archive");
		}
	}

	@Test
	void nonMembersGetNotFoundEvenForChanges() {
		var owner = register("Ola");
		var stranger = register("Sam");
		var key = create(owner);

		get(stranger, "/api/projects/" + key).expectStatus().isNotFound();
		send(stranger, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "No")).expectStatus().isNotFound();
		send(stranger, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isNotFound();
		send(stranger, HttpMethod.POST, "/api/projects/" + key + "/restore", null).expectStatus().isNotFound();
		assertThat(keys(get(stranger, "/api/projects"))).doesNotContain(key);
	}

	@Test
	void aPlatformAdminSeesListsAndManagesProjectsTheyAreNotIn() {
		var owner = register("Ola");
		var root = register("Root");
		var key = create(owner);
		assign(root, "platform_admin");

		get(root, "/api/projects/" + key).expectStatus().isOk();
		assertThat(keys(get(root, "/api/projects"))).contains(key);
		send(root, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "By root")).expectStatus().isOk();
		send(root, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isOk();
		assertThat(keys(get(root, "/api/projects?archived=true"))).contains(key);
		assertThat(keys(get(root, "/api/projects"))).doesNotContain(key);
		send(root, HttpMethod.POST, "/api/projects/" + key + "/restore", null).expectStatus().isOk();
		// The public membership lookup is unchanged: they are not a Member.
		assertThat(projects.isMember(projects.findByKey(key).orElseThrow().id(), UUID.fromString(root.id())))
			.isFalse();
	}

	@Test
	void holdingViewWithScopeAllSeesEveryProjectButCannotChangeThem() {
		var owner = register("Ola");
		var auditor = register("Aud");
		var key = create(owner);
		var role = "auditor_" + UUID.randomUUID().toString().substring(0, 8);
		jdbc.sql("""
				INSERT INTO access_roles (id, key, name, description, kind, built_in, customised, version, created_at)
				VALUES (gen_random_uuid(), :key, :key, 'Sees every project', 'PLATFORM', FALSE, FALSE, 0, now())""")
			.param("key", role).update();
		grant(role, "projects:project:view", "ALL");
		assign(auditor, role);

		get(auditor, "/api/projects/" + key).expectStatus().isOk();
		assertThat(keys(get(auditor, "/api/projects"))).contains(key);
		send(auditor, HttpMethod.PATCH, "/api/projects/" + key, Map.of("name", "No")).expectStatus().isForbidden();
		send(auditor, HttpMethod.POST, "/api/projects/" + key + "/archive", null).expectStatus().isForbidden();
	}

	private List<String> keys(RestTestClient.ResponseSpec response) {
		var body = response.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$[*].key");
	}

	private void grant(String role, String permission, String scope) {
		jdbc.sql("""
				INSERT INTO access_role_grants (role_id, permission_key, scope)
				SELECT id, :permission, :scope FROM access_roles WHERE key = :role""")
			.param("role", role).param("permission", permission).param("scope", scope).update();
	}

	private void revoke(String role, String permission) {
		jdbc.sql("""
				DELETE FROM access_role_grants WHERE permission_key = :permission
				AND role_id = (SELECT id FROM access_roles WHERE key = :role)""")
			.param("role", role).param("permission", permission).update();
	}

	private void assign(Person person, String platformRole) {
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), r.id, :user, NULL, now() FROM access_roles r WHERE r.key = :role""")
			.param("user", UUID.fromString(person.id())).param("role", platformRole).update();
	}

	private void member(String key, Person person, String role) {
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) SELECT id, :user, now() FROM projects WHERE key = :key")
			.param("user", UUID.fromString(person.id())).param("key", key).update();
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), r.id, :user, p.id, now() FROM access_roles r, projects p
				WHERE r.key = :role AND p.key = :key""")
			.param("user", UUID.fromString(person.id())).param("role", role).param("key", key).update();
	}

	private RestTestClient.ResponseSpec get(Person who, String uri) {
		return client.get().uri(uri).header("Authorization", "Bearer " + who.token()).exchange();
	}

	private RestTestClient.ResponseSpec send(Person who, HttpMethod method, String uri, Object body) {
		var spec = client.method(method).uri(uri).header("Authorization", "Bearer " + who.token());
		return (body == null ? spec : spec.body(body)).exchange();
	}

	private String newKey() {
		return "P" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append);
	}

	private String create(Person owner) {
		var key = newKey();
		send(owner, HttpMethod.POST, "/api/projects", Map.of("key", key, "name", "Project " + key)).expectStatus()
			.isCreated();
		return key;
	}

	private Person register(String name) {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		String id = JsonPath.read(response, "$.user.id");
		EmailCodes.verify(client, token, email);
		return new Person(token, id);
	}
}
