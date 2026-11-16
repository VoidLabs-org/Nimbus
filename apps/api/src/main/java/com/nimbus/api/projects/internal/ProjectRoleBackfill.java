package com.nimbus.api.projects.internal;

import java.util.List;
import java.util.UUID;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.ProjectRoles;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Gives projects made before project roles existed a Project admin, at startup after {@code access} has stored the
 * built-in Roles: a project with no Project admin gives it to its earliest Member, and every other Member without a
 * project role becomes Developer. A project that already has a Project admin is left alone, so later runs change
 * nothing.
 */
@Component
class ProjectRoleBackfill implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(ProjectRoleBackfill.class);

	// Any fixed number, the same in every instance, so instances starting together take turns.
	private static final long LOCK = 0x4e696d6275735052L;

	private final JdbcClient jdbc;
	private final ProjectRoles roles;
	private final TransactionTemplate transaction;

	ProjectRoleBackfill(JdbcClient jdbc, ProjectRoles roles, TransactionTemplate transaction) {
		this.jdbc = jdbc;
		this.roles = roles;
		this.transaction = transaction;
	}

	@Override
	public void run(ApplicationArguments args) {
		run();
	}

	void run() {
		transaction.executeWithoutResult(status -> {
			jdbc.sql("SELECT pg_advisory_xact_lock(:lock)").param("lock", LOCK).query((rs, n) -> 1).list();
			var admin = BuiltInRole.PROJECT_ADMIN.key();
			var projects = jdbc.sql("SELECT id FROM projects").query(UUID.class).list();
			for (var project : projects) {
				var members = jdbc.sql("SELECT user_id FROM project_members WHERE project_id = :project ORDER BY added_at, user_id")
					.param("project", project).query(UUID.class).list();
				if (members.isEmpty() || hasAdmin(project, members, admin)) continue;
				var first = members.getFirst();
				if (roles.roleOf(project, first).isPresent()) roles.change(null, project, first, admin);
				else roles.give(null, project, first, admin);
				for (var member : members.subList(1, members.size())) {
					if (roles.roleOf(project, member).isEmpty()) {
						roles.give(null, project, member, BuiltInRole.DEVELOPER.key());
					}
				}
				log.info("Gave project {} its first Project admin", project);
			}
		});
	}

	private boolean hasAdmin(UUID project, List<UUID> members, String admin) {
		return members.stream().anyMatch(member -> roles.roleOf(project, member).filter(admin::equals).isPresent());
	}
}
