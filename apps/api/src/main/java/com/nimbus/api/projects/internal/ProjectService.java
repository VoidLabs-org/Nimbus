package com.nimbus.api.projects.internal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.projects.ProjectSummary;
import com.nimbus.api.projects.ProjectCreated;
import com.nimbus.api.projects.Projects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owns project creation and membership; exposes only summaries to other modules. */
@Service
@Transactional(readOnly = true)
class ProjectService implements Projects {

	private static final String SELECT = "SELECT id, key, name, description, archived_at, created_at FROM projects ";

	private final JdbcClient jdbc;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	ProjectService(JdbcClient jdbc, ApplicationEventPublisher events, Clock clock) {
		this.jdbc = jdbc;
		this.events = events;
		this.clock = clock;
	}

	/** The controller has already checked the fields against the rules in {@code docs/specs/projects.md}. */
	@Transactional
	public ProjectView create(UUID actor, String key, String name, String description) {
		// Microseconds, as the database keeps them, so the time returned now is the time a later read returns.
		var project = new ProjectView(UUID.randomUUID(), key.toUpperCase(Locale.ROOT), name, description, false,
				clock.instant().truncatedTo(ChronoUnit.MICROS));
		var inserted = jdbc.sql("""
				INSERT INTO projects (id, key, name, description, created_at)
				VALUES (:id, :key, :name, :description, :at) ON CONFLICT (key) DO NOTHING
				""")
			.param("id", project.id()).param("key", project.key()).param("name", project.name())
			.param("description", project.description()).param("at", Timestamp.from(project.createdAt())).update();
		// The unique constraint arbitrates concurrent creates, including keys of Archived projects.
		if (inserted == 0) throw new KeyTaken();
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) VALUES (:project, :user, :at)")
			.param("project", project.id()).param("user", actor).param("at", Timestamp.from(project.createdAt())).update();
		events.publishEvent(new ProjectCreated(project.id(), project.key(), actor));
		return project;
	}

	/** Unknown projects and projects the actor is not a Member of are both "not found". */
	public ProjectView open(UUID actor, String key) {
		var stored = ProjectKeys.normalize(key).orElseThrow(ProjectNotFound::new);
		return jdbc.sql(SELECT + """
				WHERE key = :key
				AND EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = :user)
				""")
			.param("key", stored).param("user", actor)
			.query(ProjectService::view).optional().orElseThrow(ProjectNotFound::new);
	}

	@Override
	public Optional<ProjectSummary> findById(UUID id) {
		return jdbc.sql(SELECT + "WHERE id = :id").param("id", id).query(ProjectService::view).optional()
			.map(ProjectView::summary);
	}

	@Override
	public Optional<ProjectSummary> findByKey(String key) {
		return ProjectKeys.normalize(key).flatMap(stored -> jdbc.sql(SELECT + "WHERE key = :key").param("key", stored)
			.query(ProjectService::view).optional()).map(ProjectView::summary);
	}

	@Override
	public boolean isMember(UUID projectId, UUID userId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM project_members WHERE project_id = :project AND user_id = :user)")
			.param("project", projectId).param("user", userId).query(Boolean.class).single();
	}

	private void requireMember(UUID actor, UUID projectId) {
		if (!isMember(projectId, actor)) throw new ProjectNotFound();
	}

	/** The single change decision for the following tickets; RBAC integration will replace this rule. */
	public void requireCanChange(UUID actor, UUID projectId) {
		requireMember(actor, projectId);
	}

	private static ProjectView view(ResultSet row, int index) throws SQLException {
		return new ProjectView(row.getObject("id", UUID.class), row.getString("key"), row.getString("name"),
				row.getString("description"), row.getTimestamp("archived_at") != null,
				row.getTimestamp("created_at").toInstant());
	}

	static class KeyTaken extends RuntimeException {
		KeyTaken() {
			super("This Project key is already taken");
		}
	}

	record ProjectView(UUID id, String key, String name, String description, boolean archived, Instant createdAt) {
		ProjectSummary summary() {
			return new ProjectSummary(id, key, name, archived);
		}
	}

	static class ProjectNotFound extends RuntimeException {
		ProjectNotFound() {
			super("Project not found");
		}
	}
}
