package com.nimbus.api.projects.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.access.ProjectRoles;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Projects made before project roles existed get their Project admin back at startup, once. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProjectRoleBackfillTests {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ProjectRoles roles;

	@Autowired
	ProjectRoleBackfill backfill;

	@Test
	void theEarliestMemberBecomesProjectAdminAndTheOthersDevelopers() {
		var first = user();
		var second = user();
		var third = user();
		var project = project(first, second, third);

		backfill.run();

		assertThat(roles.roleOf(project, first)).contains("project_admin");
		assertThat(roles.roleOf(project, second)).contains("developer");
		assertThat(roles.roleOf(project, third)).contains("developer");
	}

	@Test
	void aProjectThatAlreadyHasAProjectAdminIsLeftAlone() {
		var admin = user();
		var other = user();
		var project = project(other, admin);
		roles.give(null, project, admin, "project_admin");

		backfill.run();

		assertThat(roles.roleOf(project, admin)).contains("project_admin");
		assertThat(roles.roleOf(project, other)).isEmpty();
	}

	@Test
	void anEarliestMemberWithAnotherRoleIsMadeProjectAdmin() {
		var first = user();
		var second = user();
		var project = project(first, second);
		roles.give(null, project, first, "viewer");

		backfill.run();

		assertThat(roles.roleOf(project, first)).contains("project_admin");
		assertThat(roles.roleOf(project, second)).contains("developer");
	}

	@Test
	void runningItAgainChangesNothing() {
		var first = user();
		var second = user();
		var project = project(first, second);
		backfill.run();
		roles.change(null, project, second, "viewer");

		backfill.run();

		assertThat(roles.roleOf(project, first)).contains("project_admin");
		assertThat(roles.roleOf(project, second)).contains("viewer");
	}

	private UUID user() {
		var id = UUID.randomUUID();
		jdbc.sql("""
				INSERT INTO users (id, email, display_name, created_at) VALUES (:id, :email, 'Old', now())""")
			.param("id", id).param("email", id + "@example.com").update();
		return id;
	}

	/** A project with the Members added in the order given, a minute apart, and no project roles. */
	private UUID project(UUID... members) {
		var id = UUID.randomUUID();
		var key = "B" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
		jdbc.sql("INSERT INTO projects (id, key, name, created_at) VALUES (:id, :key, 'Old', now())")
			.param("id", id).param("key", key).update();
		var at = Instant.now();
		for (var member : members) {
			jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) VALUES (:p, :u, :at)")
				.param("p", id).param("u", member).param("at", Timestamp.from(at)).update();
			at = at.plusSeconds(60);
		}
		return id;
	}
}
