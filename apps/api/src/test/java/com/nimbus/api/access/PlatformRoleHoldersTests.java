package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The Platform admin gives platform roles to Users by email and takes them away, on a Role's People tab. Other test
 * classes expect the seeded admin to be the only Platform admin, so this one gets a database of its own.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
@DirtiesContext
class PlatformRoleHoldersTests {

	@Autowired
	RestTestClient client;

	String admin;

	@BeforeEach
	void signInAsAdmin() {
		admin = signIn("root@example.com", "seeded password");
	}

	@Test
	void aPlatformRoleIsGivenByEmailListedAndTakenAway() {
		createPlatformRole("auditor");
		var ada = register("ada@example.com", "Ada");

		var added = give("auditor", " Ada@Example.com ", admin).expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat((String) JsonPath.read(added, "$.email")).isEqualTo("ada@example.com");
		assertThat((String) JsonPath.read(added, "$.displayName")).isEqualTo("Ada");

		var holders = holders("auditor", admin);
		assertThat((List<String>) JsonPath.read(holders, "$.users[*].id")).containsExactly(ada.id());
		assertThat((List<String>) JsonPath.read(holders, "$.users[*].since")).hasSize(1);

		take("auditor", ada.id(), admin).expectStatus().isNoContent();
		assertThat((List<?>) JsonPath.read(holders("auditor", admin), "$.users")).isEmpty();
	}

	@Test
	void aUserMayHoldSeveralPlatformRolesAndGetsTheirPermissions() {
		createPlatformRole("reader");
		var bo = register("bo@example.com", "Bo");
		saveGrants("reader", List.of(Map.of("permission", "access:audit:view")));

		give("reader", "bo@example.com", admin).expectStatus().isCreated();
		give("platform_admin", "bo@example.com", admin).expectStatus().isCreated();

		assertThat((List<String>) JsonPath.read(myPermissions(bo.token()), "$.platform"))
			.contains("access:audit:view", "access:role:manage");
		assertThat((List<String>) JsonPath.read(holders("platform_admin", admin), "$.users[*].email"))
			.contains("root@example.com", "bo@example.com");
	}

	@Test
	void anUnknownEmailRoleOrHolderIsNotFoundAndGivingTwiceIsAConflict() {
		createPlatformRole("support");
		var cy = register("cy@example.com", "Cy");

		give("support", "nobody@example.com", admin).expectStatus().isNotFound();
		give("no_such_role", "cy@example.com", admin).expectStatus().isNotFound();
		give("support", "cy@example.com", admin).expectStatus().isCreated();
		give("support", "cy@example.com", admin).expectStatus().isEqualTo(409);
		give("support", " ", admin).expectStatus().isBadRequest();

		take("support", register("di@example.com", "Di").id(), admin).expectStatus().isNotFound();
		take("support", cy.id(), admin).expectStatus().isNoContent();
		take("support", cy.id(), admin).expectStatus().isNotFound();
	}

	@Test
	void everyoneAndProjectRolesHaveNoHoldersHere() {
		var ed = register("ed@example.com", "Ed");
		for (var role : List.of("everyone", "developer")) {
			client.get().uri("/api/access/roles/" + role + "/users")
				.header("Authorization", "Bearer " + admin)
				.exchange()
				.expectStatus().isEqualTo(409);
			give(role, "ed@example.com", admin).expectStatus().isEqualTo(409);
			take(role, ed.id(), admin).expectStatus().isEqualTo(409);
		}
	}

	@Test
	void nobodyChangesTheirOwnAssignments() {
		createPlatformRole("observer");
		give("observer", "root@example.com", admin).expectStatus().isForbidden();
		take("platform_admin", rootId(), admin).expectStatus().isForbidden();
		assertThat((List<String>) JsonPath.read(holders("platform_admin", admin), "$.users[*].email"))
			.contains("root@example.com");
	}

	@Test
	void onlyHoldersOfTheAssignPermissionMayListGiveOrTake() {
		var fay = register("fay@example.com", "Fay");
		createPlatformRole("helper");

		client.get().uri("/api/access/roles/helper/users")
			.header("Authorization", "Bearer " + fay.token())
			.exchange()
			.expectStatus().isForbidden();
		give("helper", "fay@example.com", fay.token()).expectStatus().isForbidden();
		take("helper", fay.id(), fay.token()).expectStatus().isForbidden();
		client.get().uri("/api/access/roles/helper/users").exchange().expectStatus().isUnauthorized();
	}

	@Test
	void twoPlatformAdminsRemovingEachOtherAtOnceLeaveOneOfThem() throws Exception {
		var gus = register("gus@example.com", "Gus");
		give("platform_admin", "gus@example.com", admin).expectStatus().isCreated();
		var gusToken = signIn("gus@example.com", "correct horse");
		var others = JsonPath.<List<String>>read(holders("platform_admin", admin), "$.users[*].id");
		// Earlier tests may have added Platform admins: take them away first, so only root and Gus are left.
		for (var other : others) {
			if (!other.equals(gus.id()) && !other.equals(rootId())) {
				take("platform_admin", other, admin).expectStatus().isNoContent();
			}
		}

		var barrier = new CyclicBarrier(2);
		var rootRemovesGus = CompletableFuture.supplyAsync(() -> race(barrier, "platform_admin", gus.id(), admin));
		var gusRemovesRoot = CompletableFuture.supplyAsync(() -> race(barrier, "platform_admin", rootId(), gusToken));

		var statuses = List.of(rootRemovesGus.get(), gusRemovesRoot.get());
		assertThat(statuses).containsOnlyOnce(204);
		// The loser finds itself either no longer an admin (403) or the last one (409).
		assertThat(statuses).containsAnyOf(403, 409);
		var remaining = statuses.get(0) == 204 ? admin : gusToken;
		assertThat((List<?>) JsonPath.read(holders("platform_admin", remaining), "$.users")).hasSize(1);
		// The other tests sign in as root.
		if (remaining.equals(gusToken)) {
			give("platform_admin", "root@example.com", gusToken).expectStatus().isCreated();
		}
	}

	@Test
	void givingAndTakingAreAudited() {
		createPlatformRole("archivist");
		var hal = register("hal@example.com", "Hal");
		give("archivist", "hal@example.com", admin).expectStatus().isCreated();
		take("archivist", hal.id(), admin).expectStatus().isNoContent();

		var log = client.get().uri("/api/access/audit?size=100")
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		List<Map<String, Object>> entries = JsonPath.read(log, "$.entries[?(@.target.key == 'archivist')]");
		assertThat(entries).extracting(entry -> entry.get("action"))
			.containsSequence("role.unassigned", "role.assigned");
		assertThat((List<String>) JsonPath.read(log,
				"$.entries[?(@.target.key == 'archivist' && @.action == 'role.assigned')].after.user.email"))
			.containsExactly("hal@example.com");
		assertThat((List<String>) JsonPath.read(log,
				"$.entries[?(@.target.key == 'archivist' && @.action == 'role.unassigned')].before.user.id"))
			.containsExactly(hal.id());
		assertThat((List<String>) JsonPath.read(log,
				"$.entries[?(@.target.key == 'archivist' && @.action == 'role.assigned')].actor.email"))
			.containsExactly("root@example.com");
		// The seeded admin was made Platform admin by the system at startup (and maybe given it back by Gus since).
		assertThat((List<Object>) JsonPath.read(log,
				"$.entries[?(@.target.key == 'platform_admin' && @.action == 'role.assigned' && @.after.user.email == 'root@example.com')].actor"))
			.contains((Object) null);
	}

	private int race(CyclicBarrier barrier, String role, String userId, String token) {
		try {
			barrier.await();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
		return take(role, userId, token).returnResult().getStatus().value();
	}

	private String rootId() {
		return JsonPath.<List<String>>read(holders("platform_admin", admin), "$.users[?(@.email == 'root@example.com')].id")
			.get(0);
	}

	private RestTestClient.ResponseSpec take(String role, String userId, String token) {
		return client.delete().uri("/api/access/roles/" + role + "/users/" + userId)
			.header("Authorization", "Bearer " + token)
			.exchange();
	}

	private record Registered(String id, String token) {
	}

	private RestTestClient.ResponseSpec give(String role, String email, String token) {
		return client.post().uri("/api/access/roles/" + role + "/users")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("email", email))
			.exchange();
	}

	private String holders(String role, String token) {
		return client.get().uri("/api/access/roles/" + role + "/users")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private String myPermissions(String token) {
		return client.get().uri("/api/access/me/permissions")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private void createPlatformRole(String key) {
		client.post().uri("/api/access/roles")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("key", key, "name", key, "description", "", "kind", "platform"))
			.exchange()
			.expectStatus().isCreated();
	}

	private void saveGrants(String role, List<Map<String, String>> grants) {
		var body = client.get().uri("/api/access/roles/" + role)
			.header("Authorization", "Bearer " + admin)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		client.put().uri("/api/access/roles/" + role + "/grants")
			.header("Authorization", "Bearer " + admin)
			.body(Map.of("grants", grants, "version", JsonPath.<Integer>read(body, "$.version")))
			.exchange()
			.expectStatus().isOk();
	}

	private Registered register(String email, String name) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		return new Registered(JsonPath.read(response, "$.user.id"), JsonPath.read(response, "$.accessToken"));
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
