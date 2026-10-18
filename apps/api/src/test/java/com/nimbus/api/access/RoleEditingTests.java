package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;

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

/** The Platform admin creates, edits, resets and deletes Roles on the Roles page. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
class RoleEditingTests {

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
	void aCustomRoleIsCreatedEmptyAndListed() {
		var created = client.post().uri("/api/access/roles")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("key", "release_manager", "name", "  Release manager ", "description", "Ships releases",
					"kind", "project"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat((String) JsonPath.read(created, "$.name")).isEqualTo("Release manager");
		assertThat((String) JsonPath.read(created, "$.kind")).isEqualTo("project");
		assertThat((Boolean) JsonPath.read(created, "$.builtIn")).isFalse();
		assertThat((List<?>) JsonPath.read(created, "$.grants")).isEmpty();
		assertThat((List<String>) JsonPath.read(list(), "$.roles[*].key")).contains("release_manager");
	}

	@Test
	void aRoleKeyIsLowercaseAndUnique() {
		create("on_call", "platform").expectStatus().isCreated();
		create("on_call", "project").expectStatus().isEqualTo(409);
		create("developer", "project").expectStatus().isEqualTo(409);
		for (var key : List.of("OnCall", "1st", "a", "with space", "x".repeat(51))) {
			create(key, "project").expectStatus().isBadRequest();
		}
	}

	@Test
	void aRoleNeedsANameAndAKind() {
		client.post().uri("/api/access/roles")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("key", "nameless", "name", "  ", "description", "", "kind", "project"))
			.exchange()
			.expectStatus().isBadRequest();
		create("kindless", "team").expectStatus().isBadRequest();
	}

	@Test
	void aRoleIsRenamedFromTheVersionItWasOpenedAtAndAStaleSaveIsRefused() {
		create("support", "platform").expectStatus().isCreated();
		var opened = version("support");

		var renamed = patch("support", Map.of("name", "Support desk", "description", "Helps Users", "version", opened))
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat((String) JsonPath.read(renamed, "$.name")).isEqualTo("Support desk");
		assertThat((Integer) JsonPath.read(renamed, "$.version")).isGreaterThan(opened);

		// Someone else opened the Role before that rename and saves now.
		patch("support", Map.of("name", "Late edit", "version", opened)).expectStatus().isEqualTo(409);
		assertThat((String) JsonPath.read(role("support"), "$.name")).isEqualTo("Support desk");
	}

	@Test
	void aRolesKeyAndKindCanNeverChange() {
		create("auditor", "platform").expectStatus().isCreated();

		patch("auditor", Map.of("key", "auditors", "version", version("auditor"))).expectStatus().isBadRequest();
		patch("auditor", Map.of("kind", "project", "version", version("auditor"))).expectStatus().isBadRequest();
		patch("auditor", Map.of("name", "Auditor")).expectStatus().isBadRequest();
	}

	@Test
	void editingABuiltInRoleMarksItCustomised() {
		var viewer = role("viewer");
		assertThat((Boolean) JsonPath.read(viewer, "$.customised")).isFalse();

		patch("viewer", Map.of("description", "Reads everything", "version", version("viewer"))).expectStatus().isOk();

		assertThat((Boolean) JsonPath.read(role("viewer"), "$.customised")).isTrue();
		reset("viewer");
	}

	@Test
	void savingGrantsReplacesTheWholeSet() {
		create("triage", "project").expectStatus().isCreated();
		grants("triage", List.of(grant("projects:project:update", "project"), grant("projects:project:archive", "project")),
				version("triage")).expectStatus().isOk();

		var saved = grants("triage", List.of(grant("projects:project:archive", "project")), version("triage"))
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat((List<String>) JsonPath.read(saved, "$.grants[*].permission")).containsExactly("projects:project:archive");
	}

	@Test
	void aGrantMustFitThePermissionAndTheKindOfRole() {
		create("helpers", "project").expectStatus().isCreated();
		create("support_staff", "platform").expectStatus().isCreated();

		// Unknown Permission; a Scope it doesn't allow; a platform permission in a project role.
		grants("helpers", List.of(grant("projects:nothing:here", "project")), version("helpers")).expectStatus().isBadRequest();
		grants("helpers", List.of(grant("projects:project:update", "own")), version("helpers")).expectStatus().isBadRequest();
		grants("helpers", List.of(grant("projects:project:update", "all")), version("helpers")).expectStatus().isBadRequest();
		grants("helpers", List.of(grant("projects:project:create", null)), version("helpers")).expectStatus().isBadRequest();
		// In a platform role: project permissions only with All, platform ones without a Scope.
		grants("support_staff", List.of(grant("projects:project:update", "project")), version("support_staff"))
			.expectStatus().isBadRequest();
		grants("support_staff", List.of(grant("projects:project:create", "all")), version("support_staff"))
			.expectStatus().isBadRequest();
		grants("support_staff", List.of(grant("projects:project:view", "all"), grant("projects:project:create", null)),
				version("support_staff")).expectStatus().isOk();
	}

	@Test
	void managingAndAssigningRolesStayWithPlatformAdmin() {
		create("deputy", "platform").expectStatus().isCreated();

		grants("deputy", List.of(grant("access:role:manage", null)), version("deputy")).expectStatus().isBadRequest();
		grants("deputy", List.of(grant("access:role:assign", null)), version("deputy")).expectStatus().isBadRequest();
		grants("deputy", List.of(grant("access:audit:view", null)), version("deputy")).expectStatus().isOk();
	}

	@Test
	void projectAdminAlwaysKeepsMemberManagementAndPlatformAdminCantBeEdited() {
		grants("project_admin", List.of(grant("projects:project:update", "project")), version("project_admin"))
			.expectStatus().isEqualTo(409);
		grants("platform_admin", List.of(), version("platform_admin")).expectStatus().isEqualTo(409);
	}

	@Test
	void savingGrantsOfABuiltInRoleMarksItCustomisedAndAStaleSaveIsRefused() {
		var opened = version("developer");
		grants("developer", List.of(grant("projects:project:update", "project")), opened).expectStatus().isOk();
		assertThat((Boolean) JsonPath.read(role("developer"), "$.customised")).isTrue();

		grants("developer", List.of(), opened).expectStatus().isEqualTo(409);

		reset("developer");
		var reset = role("developer");
		assertThat((Boolean) JsonPath.read(reset, "$.customised")).isFalse();
		assertThat((List<?>) JsonPath.read(reset, "$.grants")).isEmpty();
	}

	@Test
	void aCustomRoleNobodyHoldsCanBeDeleted() {
		create("temporary", "platform").expectStatus().isCreated();

		delete("temporary").expectStatus().isNoContent();

		client.get().uri("/api/access/roles/temporary")
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isNotFound();
	}

	@Test
	void aRoleSomeoneHoldsCantBeDeleted() {
		create("held", "platform").expectStatus().isCreated();
		// Nothing can give out custom Roles yet (#47), so the holder is set up directly.
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), id, gen_random_uuid(), NULL, now() FROM access_roles WHERE key = 'held'""")
			.update();

		var refused = delete("held").expectStatus().isEqualTo(409)
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat((String) JsonPath.read(refused, "$.detail")).contains("1 ");
		role("held");
	}

	@Test
	void builtInRolesCantBeDeleted() {
		delete("viewer").expectStatus().isEqualTo(409);
		delete("platform_admin").expectStatus().isEqualTo(409);
	}

	@Test
	void thePageIsToldWhatItCantChange() {
		assertThat((Boolean) JsonPath.read(role("platform_admin"), "$.locked")).isTrue();
		assertThat((Boolean) JsonPath.read(role("viewer"), "$.locked")).isFalse();
		assertThat((List<Boolean>) JsonPath.read(role("project_admin"),
				"$.grants[?(@.permission == 'projects:member:manage')].locked")).containsExactly(true);

		var catalog = client.get().uri("/api/access/permissions")
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat((List<Boolean>) JsonPath.read(catalog, "$.permissions[?(@.key == 'access:role:manage')].reserved"))
			.containsExactly(true);
		assertThat((List<Boolean>) JsonPath.read(catalog, "$.permissions[?(@.key == 'access:audit:view')].reserved"))
			.containsExactly(false);
	}

	@Test
	void anEmptyGrantInTheListIsRefusedNotACrash() {
		create("sloppy", "project").expectStatus().isCreated();

		var body = new java.util.HashMap<String, Object>();
		body.put("grants", java.util.Arrays.asList((Object) null));
		body.put("version", version("sloppy"));
		client.put().uri("/api/access/roles/sloppy/grants")
			.header("Authorization", "Bearer " + admin)
			.body(body)
			.exchange()
			.expectStatus().isBadRequest();
	}

	@Test
	void resetIsFromTheVersionOpenedAndNeverForPlatformAdmin() {
		var opened = version("viewer");
		patch("viewer", Map.of("description", "Changed by someone else", "version", opened)).expectStatus().isOk();

		resetFrom("viewer", opened).expectStatus().isEqualTo(409);
		resetFrom("platform_admin", version("platform_admin")).expectStatus().isEqualTo(409);

		reset("viewer");
		assertThat((Boolean) JsonPath.read(role("viewer"), "$.customised")).isFalse();
	}

	@Test
	void platformAdminIsLocked() {
		patch("platform_admin", Map.of("name", "God mode", "version", version("platform_admin")))
			.expectStatus().isEqualTo(409);
	}

	@Test
	void onlyRoleManagersMayCreateRoles() {
		client.post().uri("/api/access/roles")
			.header("Authorization", "Bearer " + register("nora@example.com"))
			.body(Map.of("key", "sneaky", "name", "Sneaky", "description", "", "kind", "platform"))
			.exchange()
			.expectStatus().isForbidden();
	}

	private RestTestClient.ResponseSpec create(String key, String kind) {
		return client.post().uri("/api/access/roles")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("key", key, "name", "Some role", "description", "", "kind", kind))
			.exchange();
	}

	private RestTestClient.ResponseSpec patch(String key, Map<String, Object> body) {
		return client.patch().uri("/api/access/roles/" + key)
			.header("Authorization", "Bearer " + admin)
			.body(body)
			.exchange();
	}

	private RestTestClient.ResponseSpec grants(String key, List<Map<String, Object>> grants, int version) {
		return client.put().uri("/api/access/roles/" + key + "/grants")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("grants", grants, "version", version))
			.exchange();
	}

	private static Map<String, Object> grant(String permission, String scope) {
		var grant = new java.util.HashMap<String, Object>();
		grant.put("permission", permission);
		grant.put("scope", scope);
		return grant;
	}

	private RestTestClient.ResponseSpec delete(String key) {
		return client.delete().uri("/api/access/roles/" + key)
			.header("Authorization", "Bearer " + admin)
			.exchange();
	}

	private String role(String key) {
		return client.get().uri("/api/access/roles/" + key)
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private int version(String key) {
		return JsonPath.read(role(key), "$.version");
	}

	/** Back to the code defaults, so tests sharing this database don't affect each other. */
	private void reset(String key) {
		resetFrom(key, version(key)).expectStatus().isOk();
	}

	private RestTestClient.ResponseSpec resetFrom(String key, int version) {
		return client.post().uri("/api/access/roles/" + key + "/reset")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("version", version))
			.exchange();
	}

	private String list() {
		return client.get().uri("/api/access/roles")
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
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
