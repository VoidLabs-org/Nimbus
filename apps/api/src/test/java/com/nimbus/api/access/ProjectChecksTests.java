package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.identity.Users;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Other modules ask {@code access} how far a User may go with a project permission in a project, and give Members
 * their project role. The test declares its own project permissions, since {@code access} has none and loads no
 * other module here. Users are random ids: {@code access} stores ids and never looks Users up for these.
 */
@Import({ TestcontainersConfiguration.class, RecordingMailer.class, ProjectChecksTests.WidgetPermissions.class })
// identity needs storage for Profile pictures, which DIRECT_DEPENDENCIES of access leaves out.
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.DIRECT_DEPENDENCIES, extraIncludes = "storage",
		webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
class ProjectChecksTests {

	/** Developers edit their own widgets, Project admins every widget in the project. */
	static final String EDIT = "access:widget:edit";

	/** Developers see their own widgets; one test also gives it to Everyone with Scope All. */
	static final String VIEW = "access:widget:view";

	/** Nobody holds it but Platform admin. */
	static final String DELETE = "access:widget:delete";

	@TestConfiguration(proxyBeanMethods = false)
	static class WidgetPermissions {

		@Bean
		ModulePermissions widgets() {
			return () -> List.of(
					Permission.project(EDIT, "Widgets", "Edit widgets", Scope.OWN, Scope.PROJECT)
						.ownHint("Widgets they made")
						.grantedTo(BuiltInRole.DEVELOPER, Scope.OWN)
						.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT),
					Permission.project(VIEW, "Widgets", "See widgets", Scope.OWN, Scope.PROJECT)
						.ownHint("Widgets they made")
						.grantedTo(BuiltInRole.DEVELOPER, Scope.OWN),
					Permission.project(DELETE, "Widgets", "Delete widgets", Scope.PROJECT));
		}

	}

	@Autowired
	ProjectRoles projectRoles;

	@Autowired
	ProjectScopes scopes;

	@Autowired
	Users users;

	@Autowired
	RestTestClient client;

	@Autowired
	TransactionTemplate transaction;

	@Test
	void aMemberHasTheScopeTheirProjectRoleGrantsInThatProjectOnly() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();
		var other = UUID.randomUUID();

		projectRoles.give(null, project, user, "project_admin");

		assertThat(scopes.scope(user, project, EDIT)).contains(Scope.PROJECT);
		assertThat(scopes.scope(user, other, EDIT)).isEmpty();
		assertThat(scopes.scope(user, project, DELETE)).isEmpty();
	}

	@Test
	void ownMeansOnlyTheirOwnRecordsAndIsLeftToTheCaller() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();

		projectRoles.give(null, project, user, "developer");

		assertThat(scopes.scope(user, project, EDIT)).contains(Scope.OWN);
	}

	@Test
	void aPlatformAdminHasAllInEveryProjectEvenWhereTheirProjectRoleGrantsLess() {
		var admin = users.findByEmail("root@example.com").orElseThrow().id();
		var project = UUID.randomUUID();

		assertThat(scopes.scope(admin, UUID.randomUUID(), DELETE)).contains(Scope.ALL);
		projectRoles.give(null, project, admin, "developer");
		assertThat(scopes.scope(admin, project, EDIT)).contains(Scope.ALL);
	}

	@Test
	void whatEveryoneHoldsCountsForEveryUserAndTheWidestScopeWins() {
		var developer = UUID.randomUUID();
		var project = UUID.randomUUID();
		projectRoles.give(null, project, developer, "developer");
		assertThat(scopes.scope(developer, project, VIEW)).contains(Scope.OWN);

		giveEveryone(VIEW);

		assertThat(scopes.scope(developer, project, VIEW)).contains(Scope.ALL);
		assertThat(scopes.scope(UUID.randomUUID(), UUID.randomUUID(), VIEW)).contains(Scope.ALL);
		assertThat(scopes.filter(UUID.randomUUID(), VIEW).allProjects()).isTrue();
		assertThat(scopes.scope(developer, project, EDIT)).contains(Scope.OWN);
	}

	@Test
	void theListFilterSaysWhereTheUserSeesEverythingAndWhereOnlyTheirOwn() {
		var user = UUID.randomUUID();
		var adminIn = UUID.randomUUID();
		var developerIn = UUID.randomUUID();
		var viewerIn = UUID.randomUUID();
		projectRoles.give(null, adminIn, user, "project_admin");
		projectRoles.give(null, developerIn, user, "developer");
		projectRoles.give(null, viewerIn, user, "viewer");
		// Someone else's role elsewhere doesn't leak into this User's filter.
		projectRoles.give(null, UUID.randomUUID(), UUID.randomUUID(), "project_admin");

		var filter = scopes.filter(user, EDIT);

		assertThat(filter.allProjects()).isFalse();
		assertThat(filter.everythingIn()).containsExactly(adminIn);
		assertThat(filter.ownIn()).containsExactly(developerIn);
		assertThat(filter.scopeIn(viewerIn)).isEmpty();
		assertThat(scopes.filter(user, DELETE)).isEqualTo(new ProjectFilter(false, Set.of(), Set.of()));
	}

	@Test
	void aPlatformAdminsListFilterCoversEveryProject() {
		var admin = users.findByEmail("root@example.com").orElseThrow().id();
		projectRoles.give(null, UUID.randomUUID(), admin, "developer");

		var filter = scopes.filter(admin, EDIT);

		assertThat(filter.allProjects()).isTrue();
		assertThat(filter.everythingIn()).isEmpty();
		assertThat(filter.ownIn()).isEmpty();
		assertThat(filter.scopeIn(UUID.randomUUID())).contains(Scope.ALL);
	}

	@Test
	void aProjectRoleIsChangedAndRemoved() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();

		projectRoles.give(null, project, user, "developer");
		projectRoles.change(null, project, user, "project_admin");
		assertThat(projectRoles.roleOf(project, user)).contains("project_admin");
		assertThat(scopes.scope(user, project, EDIT)).contains(Scope.PROJECT);

		projectRoles.remove(null, project, user);
		assertThat(projectRoles.roleOf(project, user)).isEmpty();
		assertThat(scopes.scope(user, project, EDIT)).isEmpty();
		assertThatThrownBy(() -> projectRoles.remove(null, project, user)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> projectRoles.change(null, project, user, "viewer"))
			.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void aUserHoldsAtMostOneProjectRolePerProject() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();

		projectRoles.give(null, project, user, "viewer");
		assertThatThrownBy(() -> projectRoles.give(null, project, user, "project_admin"))
			.isInstanceOf(IllegalStateException.class);
		assertThat(projectRoles.roleOf(project, user)).contains("viewer");

		var other = UUID.randomUUID();
		projectRoles.give(null, other, user, "project_admin");
		assertThat(projectRoles.roleOf(other, user)).contains("project_admin");
		assertThat(projectRoles.roleOf(project, user)).contains("viewer");
	}

	@Test
	void onlyProjectRolesAreGiven() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();

		for (var role : List.of("platform_admin", "everyone", "no_such_role")) {
			assertThatThrownBy(() -> projectRoles.give(null, project, user, role))
				.isInstanceOf(NotAProjectRoleException.class);
		}
		assertThat(projectRoles.roleOf(project, user)).isEmpty();

		projectRoles.give(null, project, user, "viewer");
		assertThatThrownBy(() -> projectRoles.change(null, project, user, "platform_admin"))
			.isInstanceOf(NotAProjectRoleException.class);
		assertThat(projectRoles.roleOf(project, user)).contains("viewer");
	}

	@Test
	void requireGivesTheScopeOrRefuses() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();
		projectRoles.give(null, project, user, "viewer");

		assertThatThrownBy(() -> scopes.require(user, project, EDIT)).isInstanceOf(PermissionDeniedException.class);
		projectRoles.change(null, project, user, "developer");
		assertThat(scopes.require(user, project, EDIT)).isEqualTo(Scope.OWN);
	}

	@Test
	void onlyProjectPermissionsInTheCatalogCanBeAskedAbout() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();

		assertThatThrownBy(() -> scopes.scope(user, project, "access:widget:typo"))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> scopes.scope(user, project, "access:role:manage"))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> scopes.filter(user, "access:role:manage"))
			.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void aRequestSeesItsOwnChanges() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
		try {
			assertThat(scopes.scope(user, project, EDIT)).isEmpty();
			projectRoles.give(null, project, user, "project_admin");
			assertThat(scopes.scope(user, project, EDIT)).contains(Scope.PROJECT);
		}
		finally {
			RequestContextHolder.resetRequestAttributes();
		}
	}

	@Test
	void aRequestForgetsWhatItReadInsideATransactionThatRolledBack() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
		try {
			transaction.executeWithoutResult(status -> {
				projectRoles.give(null, project, user, "project_admin");
				assertThat(scopes.scope(user, project, EDIT)).contains(Scope.PROJECT);
				status.setRollbackOnly();
			});

			assertThat(scopes.scope(user, project, EDIT)).isEmpty();
		}
		finally {
			RequestContextHolder.resetRequestAttributes();
		}
	}

	@Test
	void aCallerMayCatchARefusedChangeAndStillCommitItsTransaction() {
		var user = UUID.randomUUID();
		var project = UUID.randomUUID();

		transaction.executeWithoutResult(status -> {
			projectRoles.give(null, project, user, "viewer");
			assertThatThrownBy(() -> projectRoles.give(null, project, user, "developer"))
				.isInstanceOf(IllegalStateException.class);
			assertThatThrownBy(() -> projectRoles.change(null, project, user, "platform_admin"))
				.isInstanceOf(NotAProjectRoleException.class);
			projectRoles.change(null, project, user, "developer");
		});

		assertThat(projectRoles.roleOf(project, user)).contains("developer");
	}

	@Test
	void aMissingIdFailsLoudlyInsteadOfIgnoringTheProjectRole() {
		assertThatThrownBy(() -> scopes.scope(UUID.randomUUID(), null, EDIT)).isInstanceOf(NullPointerException.class);
		assertThatThrownBy(() -> scopes.scope(null, UUID.randomUUID(), EDIT)).isInstanceOf(NullPointerException.class);
		assertThatThrownBy(() -> scopes.filter(null, EDIT)).isInstanceOf(NullPointerException.class);
	}

	/** Adds a Grant with Scope All to Everyone, as the Platform admin would on the Roles page. */
	private void giveEveryone(String permission) {
		var token = signIn("root@example.com", "seeded password");
		var everyone = client.get().uri("/api/access/roles/everyone")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		List<Map<String, Object>> grants = new java.util.ArrayList<>(JsonPath.read(everyone, "$.grants"));
		grants.add(Map.of("permission", permission, "scope", "all"));
		client.put().uri("/api/access/roles/everyone/grants")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("grants", grants, "version", JsonPath.<Integer>read(everyone, "$.version")))
			.exchange()
			.expectStatus().isOk();
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
