package com.nimbus.api.issues.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.nimbus.api.projects.MemberRemoved;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * A User removed from a project can no longer be an Assignee there (the Assignee must be a Member), so their Issues
 * in that project become unassigned, each with a history entry made by the system. Silent otherwise: no
 * {@code IssueChanged}, so nobody is notified of a reassignment nobody made.
 */
@Component
class MemberRemovedUnassigns {

	private final JdbcClient jdbc;
	private final Clock clock;

	MemberRemovedUnassigns(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@ApplicationModuleListener
	void on(MemberRemoved event) {
		var at = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS));
		var ids = jdbc.sql("""
				UPDATE issues SET assignee_id = NULL, updated_at = :at
				WHERE project_id = :project AND assignee_id = :user RETURNING id""")
			.param("at", at).param("project", event.projectId()).param("user", event.userId())
			.query(UUID.class).list();
		for (var id : ids) {
			jdbc.sql("""
					INSERT INTO issue_history (id, issue_id, actor_id, at, field, before_value, after_value)
					VALUES (:id, :issue, NULL, :at, 'assignee', :before, NULL)""")
				.param("id", UUID.randomUUID()).param("issue", id).param("at", at)
				.param("before", event.userId().toString()).update();
		}
	}
}
