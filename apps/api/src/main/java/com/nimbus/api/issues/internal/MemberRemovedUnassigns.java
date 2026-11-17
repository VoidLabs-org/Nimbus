package com.nimbus.api.issues.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import com.nimbus.api.issues.IssueChanged;
import com.nimbus.api.projects.MemberRemoved;
import com.nimbus.api.projects.Projects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * A User removed from a project can no longer be an Assignee there (the Assignee must be a Member), so their Issues
 * in that project become unassigned, each with a history entry made by the system (no actor) and an
 * {@code IssueChanged} with a {@code null} {@code actorId}. Notifications ignore system-made changes, so nobody is
 * told of a reassignment nobody made.
 */
@Component
class MemberRemovedUnassigns {

	private final JdbcClient jdbc;
	private final Clock clock;
	private final Projects projects;
	private final ApplicationEventPublisher events;

	MemberRemovedUnassigns(JdbcClient jdbc, Clock clock, Projects projects, ApplicationEventPublisher events) {
		this.jdbc = jdbc;
		this.clock = clock;
		this.projects = projects;
		this.events = events;
	}

	@ApplicationModuleListener
	void on(MemberRemoved event) {
		var at = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS));
		var project = projects.findById(event.projectId()).orElse(null);
		if (project == null) return;
		var unassigned = jdbc.sql("""
				UPDATE issues SET assignee_id = NULL, updated_at = :at
				WHERE project_id = :project AND assignee_id = :user RETURNING id, number, title, reporter_id""")
			.param("at", at).param("project", event.projectId()).param("user", event.userId())
			.query((row, i) -> new Unassigned(row.getObject("id", UUID.class), row.getInt("number"),
					row.getString("title"), row.getObject("reporter_id", UUID.class)))
			.list();
		for (var issue : unassigned) {
			var id = issue.id();
			jdbc.sql("""
					INSERT INTO issue_history (id, issue_id, actor_id, at, field, before_value, after_value)
					VALUES (:id, :issue, NULL, :at, 'assignee', :before, NULL)""")
				.param("id", UUID.randomUUID()).param("issue", id).param("at", at)
				.param("before", event.userId().toString()).update();
			events.publishEvent(new IssueChanged(project.id(), IssueKeys.format(project.key(), issue.number()), null,
					issue.title(), issue.reporterId(), null,
					List.of(new IssueChanged.Change("assignee", event.userId().toString(), null)), at.toInstant()));
		}
	}

	private record Unassigned(UUID id, int number, String title, UUID reporterId) {
	}
}
