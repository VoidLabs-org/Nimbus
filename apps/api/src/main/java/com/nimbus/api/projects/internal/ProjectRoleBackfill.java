package com.nimbus.api.projects.internal;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
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
 * Gives projects made before project roles existed their roles, at startup. {@code access} has stored the built-in
 * Roles by then ({@code StartupSync} runs when the singletons are ready, before any runner): a project with no Project
 * admin gives it to its earliest Member, and every Member without a project role becomes Developer. Later runs change
 * nothing for a Member who has a role.
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
			// One query for every Member, earliest first; each Member's role is then read once.
			var membersByProject = new LinkedHashMap<UUID, List<UUID>>();
			jdbc.sql("SELECT project_id, user_id FROM project_members ORDER BY project_id, added_at, user_id")
				.query((rs, n) -> membersByProject
					.computeIfAbsent(rs.getObject("project_id", UUID.class), project -> new ArrayList<>())
					.add(rs.getObject("user_id", UUID.class)))
				.list();
			membersByProject.forEach((project, members) -> {
				var held = new LinkedHashMap<UUID, Optional<String>>();
				members.forEach(member -> held.put(member, roles.roleOf(project, member)));
				var hasAdmin = held.values().stream().anyMatch(role -> role.filter(admin::equals).isPresent());
				var first = members.getFirst();
				if (!hasAdmin) {
					if (held.get(first).isPresent()) roles.change(null, project, first, admin);
					else roles.give(null, project, first, admin);
					held.put(first, Optional.of(admin));
					log.info("Gave project {} its first Project admin", project);
				}
				held.forEach((member, role) -> {
					if (role.isEmpty()) roles.give(null, project, member, BuiltInRole.DEVELOPER.key());
				});
			});
		});
	}
}
