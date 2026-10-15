package com.nimbus.api.access.internal;

import static org.assertj.core.api.Assertions.assertThat;

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
