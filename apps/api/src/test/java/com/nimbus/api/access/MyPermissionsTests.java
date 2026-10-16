package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

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
 * What the web app asks to hide what the signed-in User can't use: their platform permissions and, for a project,
 * their Scope for each project permission there. Members get their project role through {@link ProjectRoles}, as
 * {@code projects} will give it.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
class MyPermissionsTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ProjectRoles projectRoles;

	@Test
	void aMemberGetsTheirScopeForEachProjectPermissionTheyHaveInThatProject() {
		var token = register("pia@example.com");
		var project = UUID.randomUUID();
		projectRoles.give(null, project, userId(token), "project_admin");

		var body = mine(token, project);

		assertThat((Map<String, String>) JsonPath.read(body, "$.project")).isEqualTo(Map.of(
				"projects:project:update", "project", "projects:project:archive", "project",
				"projects:member:manage", "project"));
		assertThat((java.util.List<String>) JsonPath.read(body, "$.platform")).containsExactly("projects:project:create");
		assertThat((Map<String, String>) JsonPath.read(mine(token, UUID.randomUUID()), "$.project")).isEmpty();
	}

	@Test
	void aPlatformAdminHasAllInAProjectTheyAreNotIn() {
		var body = mine(signIn("root@example.com", "seeded password"), UUID.randomUUID());

		assertThat((Map<String, String>) JsonPath.read(body, "$.project")).containsEntry("projects:project:view", "all")
			.containsEntry("projects:member:manage", "all")
			.containsEntry("projects:project:update", "all");
	}

	@Test
	void eachRequestSeesTheCurrentRoles() {
		var token = register("quinn@example.com");
		var project = UUID.randomUUID();
		projectRoles.give(null, project, userId(token), "viewer");
		assertThat((Map<String, String>) JsonPath.read(mine(token, project), "$.project")).isEmpty();

		projectRoles.change(null, project, userId(token), "project_admin");

		assertThat((Map<String, String>) JsonPath.read(mine(token, project), "$.project"))
			.containsEntry("projects:project:update", "project");
	}

	@Test
	void withoutAProjectOnlyPlatformPermissionsAreReturned() {
		var body = client.get().uri("/api/access/me/permissions")
			.header("Authorization", "Bearer " + register("rae@example.com"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat((Map<String, Object>) JsonPath.read(body, "$")).containsOnlyKeys("platform");
	}

	@Test
	void aProjectThatIsNotAnIdIsABadRequestAndNobodySignedInIsUnauthorized() {
		client.get().uri("/api/access/me/permissions?project=NIM")
			.header("Authorization", "Bearer " + register("sol@example.com"))
			.exchange()
			.expectStatus().isBadRequest();

		client.get().uri("/api/access/me/permissions?project=" + UUID.randomUUID())
			.exchange()
			.expectStatus().isUnauthorized();
	}

	private String mine(String token, UUID project) {
		return client.get().uri("/api/access/me/permissions?project=" + project)
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private UUID userId(String token) {
		var me = client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		return UUID.fromString(JsonPath.read(me, "$.id"));
	}

	private String register(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Pia", "email", email, "password", "correct horse"))
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
