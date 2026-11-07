package com.nimbus.api.projects.internal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
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

	private static final String SELECT = "SELECT id, key, name, description, archived_at, created_at, created_by FROM projects ";

	private final JdbcClient jdbc;
	private final ApplicationEventPublisher events;
	private final Clock clock;
	private final Users users;

	ProjectService(JdbcClient jdbc, ApplicationEventPublisher events, Clock clock, Users users) {
		this.jdbc = jdbc;
		this.events = events;
		this.clock = clock;
		this.users = users;
	}

	/** The controller has already checked the fields against the rules in {@code docs/specs/projects.md}. */
	@Transactional
	public ProjectView create(UUID actor, String key, String name, String description) {
		// Microseconds, as the database keeps them, so the time returned now is the time a later read returns.
		var project = new Row(UUID.randomUUID(), key.toUpperCase(Locale.ROOT), name, description, false,
				clock.instant().truncatedTo(ChronoUnit.MICROS), actor);
		var inserted = jdbc.sql("""
				INSERT INTO projects (id, key, name, description, created_at, created_by)
				VALUES (:id, :key, :name, :description, :at, :by) ON CONFLICT (key) DO NOTHING
				""")
			.param("id", project.id()).param("key", project.key()).param("name", project.name())
			.param("description", project.description()).param("at", Timestamp.from(project.createdAt()))
			.param("by", actor).update();
		// The unique constraint arbitrates concurrent creates, including keys of Archived projects.
		if (inserted == 0) throw new KeyTaken();
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) VALUES (:project, :user, :at)")
			.param("project", project.id()).param("user", actor).param("at", Timestamp.from(project.createdAt())).update();
		events.publishEvent(new ProjectCreated(project.id(), project.key(), actor));
		return withPeople(List.of(project)).getFirst();
	}

	/**
	 * The active (not Archived) projects the actor is a Member of, by lower-cased name, then by key (names need not be
	 * unique). Sorted here and not by the database, as the Roles are, so the order is the same on every database
	 * whatever its locale: a collation would skip spaces and punctuation, and its {@code lower()} differs from Java's.
	 */
	public List<ProjectView> listFor(UUID actor) {
		return withPeople(activeOf(actor));
	}

	/** The active projects the User is a Member of, in the list's order (see listFor). */
	private List<Row> activeOf(UUID user) {
		return jdbc.sql(SELECT + """
				WHERE archived_at IS NULL
				AND EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = :user)
				""")
			.param("user", user).query(ProjectService::row).list().stream()
			.sorted(Comparator.comparing((Row project) -> project.name().toLowerCase(Locale.ROOT))
				.thenComparing(Row::key))
			.toList();
	}

	@Override
	public List<ProjectSummary> memberProjects(UUID userId) {
		return activeOf(userId).stream().map(Row::summary).toList();
	}

	/** Unknown projects and projects the actor is not a Member of are both "not found". */
	public ProjectView open(UUID actor, String key) {
		var stored = ProjectKeys.normalize(key).orElseThrow(ProjectNotFound::new);
		var project = jdbc.sql(SELECT + """
				WHERE key = :key
				AND EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = :user)
				""")
			.param("key", stored).param("user", actor)
			.query(ProjectService::row).optional().orElseThrow(ProjectNotFound::new);
		return withPeople(List.of(project)).getFirst();
	}

	@Override
	public Optional<ProjectSummary> findById(UUID id) {
		return jdbc.sql(SELECT + "WHERE id = :id").param("id", id).query(ProjectService::row).optional()
			.map(Row::summary);
	}

	@Override
	public Optional<ProjectSummary> findByKey(String key) {
		return ProjectKeys.normalize(key).flatMap(stored -> jdbc.sql(SELECT + "WHERE key = :key").param("key", stored)
			.query(ProjectService::row).optional()).map(Row::summary);
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

	/** How many Members a project shows by name and picture; the rest are only counted. */
	static final int MEMBERS_SHOWN = 5;

	/**
	 * The projects as the API shows them: each with its creator, its Member count and its first Members (earliest
	 * added first), as names and pictures. One query reads the Members of all the projects and one lookup finds every
	 * User named, however many projects there are. A creator who is no longer known (or none recorded) is
	 * {@code null}; a Member no longer known is left out of those shown but still counted.
	 */
	private List<ProjectView> withPeople(List<Row> rows) {
		var members = new java.util.HashMap<UUID, List<UUID>>();
		if (!rows.isEmpty()) {
			jdbc.sql("""
					SELECT project_id, user_id FROM project_members WHERE project_id IN (:ids)
					ORDER BY project_id, added_at, user_id
					""").param("ids", rows.stream().map(Row::id).toList())
				.query((row, index) -> members.computeIfAbsent(row.getObject("project_id", UUID.class),
						project -> new java.util.ArrayList<>()).add(row.getObject("user_id", UUID.class)))
				.list();
		}
		var ids = new java.util.HashSet<UUID>();
		rows.stream().map(Row::createdBy).filter(Objects::nonNull).forEach(ids::add);
		members.values().forEach(list -> ids.addAll(list.subList(0, Math.min(MEMBERS_SHOWN, list.size()))));
		var people = ids.isEmpty() ? Map.<UUID, UserSummary>of()
				: users.findAllById(ids).stream().collect(Collectors.toMap(UserSummary::id, Function.identity()));
		return rows.stream().map(row -> {
			var creator = row.createdBy() == null ? null : people.get(row.createdBy());
			var all = members.getOrDefault(row.id(), List.of());
			var shown = all.stream().limit(MEMBERS_SHOWN).map(people::get).filter(Objects::nonNull)
				.map(ProjectService::person).toList();
			return new ProjectView(row.id(), row.key(), row.name(), row.description(), row.archived(),
					row.createdAt(), creator == null ? null : person(creator), all.size(), shown);
		}).toList();
	}

	private static PersonView person(UserSummary user) {
		return new PersonView(user.id(), user.displayName(), user.avatarUrl());
	}

	private static Row row(ResultSet row, int index) throws SQLException {
		return new Row(row.getObject("id", UUID.class), row.getString("key"), row.getString("name"),
				row.getString("description"), row.getTimestamp("archived_at") != null,
				row.getTimestamp("created_at").toInstant(), row.getObject("created_by", UUID.class));
	}

	static class KeyTaken extends RuntimeException {
		KeyTaken() {
			super("This Project key is already taken");
		}
	}

	/** A project as stored. */
	private record Row(UUID id, String key, String name, String description, boolean archived, Instant createdAt,
			UUID createdBy) {
		ProjectSummary summary() {
			return new ProjectSummary(id, key, name, archived);
		}
	}

	/**
	 * A project as the API shows it. {@code createdBy} is {@code null} when the creator is unknown; {@code members}
	 * are at most {@link #MEMBERS_SHOWN} of the {@code memberCount}, earliest added first.
	 */
	record ProjectView(UUID id, String key, String name, String description, boolean archived, Instant createdAt,
			PersonView createdBy, int memberCount, List<PersonView> members) {
	}

	/** A User as a project shows them. {@code avatarUrl} is {@code null} without a picture. */
	record PersonView(UUID id, String displayName, String avatarUrl) {
	}

	static class ProjectNotFound extends RuntimeException {
		ProjectNotFound() {
			super("Project not found");
		}
	}
}
