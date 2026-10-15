package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The read-only Roles pages: the built-in Roles and the Permission catalog, for the Platform admin only. The admin
 * seed creates the Platform admin, as on a real first start.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
class RolesTests {

	@Autowired
	RestTestClient client;

	@Test
	void thePlatformAdminSeesTheBuiltInRoles() {
		var body = client.get().uri("/api/access/roles")
			.header("Authorization", "Bearer " + signIn("root@example.com", "seeded password"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();

		List<String> keys = JsonPath.read(body, "$.roles[*].key");
		assertThat(keys).containsExactlyInAnyOrder("platform_admin", "everyone", "project_admin", "developer", "viewer");
		assertThat((List<String>) JsonPath.read(body, "$.roles[?(@.kind == 'platform')].key"))
			.containsExactlyInAnyOrder("platform_admin", "everyone");
		assertThat((List<Boolean>) JsonPath.read(body, "$.roles[*].builtIn")).containsOnly(true);
		assertThat((List<Integer>) JsonPath.read(body, "$.roles[?(@.key == 'platform_admin')].holders")).containsExactly(1);
	}

	@Test
	void eachBuiltInRoleHasItsDefaultGrants() {
		var admin = signIn("root@example.com", "seeded password");

		var platformAdmin = role("platform_admin", admin);
		assertThat(scopeOf(platformAdmin, "projects:project:update")).isEqualTo("all");
		assertThat(scopeOf(platformAdmin, "access:role:manage")).isNull();
		assertThat((List<String>) JsonPath.read(platformAdmin, "$.grants[*].permission"))
			.contains("access:role:manage", "access:role:assign", "access:audit:view", "projects:project:create",
					"projects:project:view", "projects:project:archive", "projects:member:manage");

		var projectAdmin = role("project_admin", admin);
		assertThat((List<String>) JsonPath.read(projectAdmin, "$.grants[*].permission"))
			.containsExactlyInAnyOrder("projects:project:update", "projects:project:archive", "projects:member:manage");
		assertThat((List<String>) JsonPath.read(projectAdmin, "$.grants[*].scope")).containsOnly("project");

		assertThat((List<String>) JsonPath.read(role("everyone", admin), "$.grants[*].permission"))
			.containsExactly("projects:project:create");
		assertThat((List<?>) JsonPath.read(role("developer", admin), "$.grants")).isEmpty();
		assertThat((List<?>) JsonPath.read(role("viewer", admin), "$.grants")).isEmpty();
	}

	@Test
	void theCatalogListsEveryPermissionWithWhereItApplies() {
		var body = client.get().uri("/api/access/permissions")
			.header("Authorization", "Bearer " + signIn("root@example.com", "seeded password"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat((List<String>) JsonPath.read(body, "$.permissions[?(@.key == 'projects:project:create')].kind"))
			.containsExactly("platform");
		assertThat((List<List<String>>) JsonPath.read(body, "$.permissions[?(@.key == 'projects:member:manage')].scopes"))
			.containsExactly(List.of("project"));
		assertThat((List<String>) JsonPath.read(body, "$.permissions[?(@.key == 'access:audit:view')].heading"))
			.containsExactly("Access");
	}

	@Test
	void anUnknownRoleIsNotFound() {
		client.get().uri("/api/access/roles/no_such_role")
			.header("Authorization", "Bearer " + signIn("root@example.com", "seeded password"))
			.exchange()
			.expectStatus().isNotFound();
	}

	@Test
	void anyoneElseIsRefused() {
		client.get().uri("/api/access/roles")
			.header("Authorization", "Bearer " + register("dana@example.com"))
			.exchange()
			.expectStatus().isForbidden();

		client.get().uri("/api/access/roles").exchange().expectStatus().isUnauthorized();
	}

	private String role(String key, String token) {
		return client.get().uri("/api/access/roles/" + key)
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private static String scopeOf(String role, String permission) {
		List<String> scopes = JsonPath.read(role, "$.grants[?(@.permission == '" + permission + "')].scope");
		assertThat(scopes).hasSize(1);
		return scopes.get(0);
	}

	private String register(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(response, "$.accessToken");
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
