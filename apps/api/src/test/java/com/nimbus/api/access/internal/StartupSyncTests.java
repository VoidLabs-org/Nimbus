package com.nimbus.api.access.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;

import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.access.PlatformPermissions;
import com.nimbus.api.identity.Users;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

/**
 * What every startup does to a database left by an earlier version. Each test sets up such a state directly,
 * since no endpoint can produce it, then runs the startup sync again and checks the result through the Roles the
 * API serves and {@link PlatformPermissions}.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@TestPropertySource(properties = { "nimbus.admin.email=root@example.com", "nimbus.admin.password=seeded password" })
@ExtendWith(OutputCaptureExtension.class)
class StartupSyncTests {

	@Autowired
	StartupSync startup;

	@Autowired
	Roles roles;

	@Autowired
	PlatformPermissions permissions;

	@Autowired
	Users users;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	RoleEditor editor;

	@Test
	void aVerifiedAdminWhoLostPlatformAdminGetsItBackAtStartup() {
		var admin = users.findByEmail("root@example.com").orElseThrow().id();
		// As if the admin had been seeded before access existed.
		jdbc.sql("DELETE FROM access_role_assignments WHERE user_id = :user").param("user", admin).update();
		assertThat(permissions.holds(admin, "access:role:manage")).isFalse();

		startup.run();
		startup.run();

		assertThat(permissions.holds(admin, "access:role:manage")).isTrue();
		assertThat(roles.require("platform_admin").holders()).isEqualTo(1);
	}

	@Test
	void aGrantForAPermissionThatNoLongerExistsAllowsNothingAndIsLoggedButKept(CapturedOutput output) {
		var everyone = roles.require("everyone").id();
		jdbc.sql("INSERT INTO access_role_grants (role_id, permission_key, scope) VALUES (:id, 'projects:gone:away', NULL)")
			.param("id", everyone)
			.update();
		// Customised, so startup leaves its Grants alone and the unknown one survives.
		jdbc.sql("UPDATE access_roles SET customised = TRUE WHERE id = :id").param("id", everyone).update();

		startup.run();

		assertThat(output).contains("Role everyone has a Grant for projects:gone:away");
		// Recorded once for the audit log by the system, not again at every startup.
		startup.run();
		var warnings = jdbc.sql("""
				SELECT COUNT(*) FROM access_audit_entries
				WHERE action = 'catalog.unknown_grant' AND target_key = 'everyone' AND actor_id IS NULL
				AND after ->> 'permission' = 'projects:gone:away'""")
			.query(Integer.class)
			.single();
		assertThat(warnings).isEqualTo(1);
		assertThat(permissions.holds(UUID.randomUUID(), "projects:gone:away")).isFalse();
		assertThat(roles.require("everyone").grants()).extracting(Roles.GrantView::permission)
			.doesNotContain("projects:gone:away");
		var kept = jdbc.sql("SELECT COUNT(*) FROM access_role_grants WHERE permission_key = 'projects:gone:away'")
			.query(Integer.class)
			.single();
		assertThat(kept).isEqualTo(1);

		reset("everyone");
	}

	@Test
	void aCustomisedBuiltInRoleKeepsItsGrantsAndAnUncustomisedOneIsReset() {
		var developer = roles.require("developer").id();
		var viewer = roles.require("viewer").id();
		for (var id : new UUID[] { developer, viewer }) {
			jdbc.sql("INSERT INTO access_role_grants (role_id, permission_key, scope) VALUES (:id, 'projects:project:update', 'PROJECT')")
				.param("id", id)
				.update();
		}
		jdbc.sql("UPDATE access_roles SET customised = TRUE WHERE id = :id").param("id", developer).update();

		startup.run();

		assertThat(roles.require("developer").grants()).extracting(Roles.GrantView::permission)
			.containsExactly("projects:project:update");
		assertThat(roles.require("viewer").grants()).isEmpty();

		reset("developer");
	}

	@Test
	void aCustomisedBuiltInRoleReportsDefaultsThatAppearedAfterItWasCustomised() {
		var projectAdmin = roles.require("project_admin").id();
		// Customised an hour ago, with update and archive removed. Then a release added update as a new Permission;
		// archive existed before, so its removal was the admin's choice.
		jdbc.sql("UPDATE access_roles SET customised = TRUE, customised_at = now() - INTERVAL '1 hour' WHERE id = :id")
			.param("id", projectAdmin)
			.update();
		jdbc.sql("""
				DELETE FROM access_role_grants WHERE role_id = :id
				AND permission_key IN ('projects:project:update', 'projects:project:archive')""")
			.param("id", projectAdmin)
			.update();
		jdbc.sql("UPDATE access_permissions SET first_seen_at = now() - INTERVAL '2 hours' WHERE key = 'projects:project:archive'")
			.update();
		jdbc.sql("UPDATE access_permissions SET first_seen_at = now() WHERE key = 'projects:project:update'").update();

		startup.run();

		assertThat(roles.require("project_admin").newPermissions()).containsExactly("projects:project:update");
		assertThat(roles.require("developer").newPermissions()).isEmpty();

		// The admin saw the notice and saved the Permissions without it: that was their choice, so no more notice.
		var current = roles.require("project_admin");
		editor.saveGrants(UUID.randomUUID(), "project_admin", current.grants().stream()
			.map(grant -> new RoleEditor.RequestedGrant(grant.permission(), grant.scope()))
			.toList(), current.version());
		assertThat(roles.require("project_admin").newPermissions()).isEmpty();

		reset("project_admin");
		assertThat(roles.require("project_admin").newPermissions()).isEmpty();
	}

	@Test
	void startupPutsBackALockedGrantEvenInACustomisedRole() {
		var projectAdmin = roles.require("project_admin").id();
		jdbc.sql("UPDATE access_roles SET customised = TRUE, customised_at = now() WHERE id = :id")
			.param("id", projectAdmin)
			.update();
		jdbc.sql("DELETE FROM access_role_grants WHERE role_id = :id AND permission_key = 'projects:member:manage'")
			.param("id", projectAdmin)
			.update();

		startup.run();

		assertThat(roles.require("project_admin").grants())
			.filteredOn(grant -> grant.permission().equals("projects:member:manage"))
			.singleElement()
			.satisfies(grant -> {
				assertThat(grant.scope()).isEqualTo("project");
				assertThat(grant.locked()).isTrue();
			});
		assertThat(roles.require("project_admin").customised()).isTrue();

		reset("project_admin");
	}

	@Test
	void aCustomRoleWithABuiltInRolesKeyStopsStartupInsteadOfBeingOverwritten() {
		// As if an admin had created "viewer" as a custom Role before a release made it built in.
		jdbc.sql("UPDATE access_roles SET built_in = FALSE WHERE key = 'viewer'").update();
		try {
			assertThatThrownBy(startup::run).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("viewer")
				.hasMessageContaining("custom Role");
		}
		finally {
			jdbc.sql("UPDATE access_roles SET built_in = TRUE WHERE key = 'viewer'").update();
		}
	}

	@Test
	void platformAdminIsResetEvenWhenMarkedCustomised() {
		var platformAdmin = roles.require("platform_admin").id();
		jdbc.sql("DELETE FROM access_role_grants WHERE role_id = :id AND permission_key = 'access:role:manage'")
			.param("id", platformAdmin)
			.update();
		jdbc.sql("UPDATE access_roles SET customised = TRUE WHERE id = :id").param("id", platformAdmin).update();

		startup.run();

		assertThat(roles.require("platform_admin").grants()).extracting(Roles.GrantView::permission)
			.contains("access:role:manage");
	}

	@Test
	void twoInstancesStartingAtOnceAgainstOneDatabaseBothSucceed() throws Exception {
		for (var round = 0; round < 10; round++) {
			var bothReady = new CyclicBarrier(2);
			var first = CompletableFuture.runAsync(() -> startTogether(bothReady));
			var second = CompletableFuture.runAsync(() -> startTogether(bothReady));

			CompletableFuture.allOf(first, second).get();
		}

		assertThat(roles.all()).hasSize(5);
	}

	private void startTogether(CyclicBarrier bothReady) {
		try {
			bothReady.await();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
		startup.run();
	}

	/** Back to the code defaults, so tests sharing this database don't affect each other. */
	private void reset(String role) {
		jdbc.sql("UPDATE access_roles SET customised = FALSE WHERE key = :key").param("key", role).update();
		startup.run();
	}

}
