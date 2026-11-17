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

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.ProjectRoles;
import com.nimbus.api.access.ProjectScopes;
import com.nimbus.api.access.Scope;
import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import com.nimbus.api.projects.ProjectSummary;
import com.nimbus.api.projects.MemberRemoved;
import com.nimbus.api.projects.ProjectCreated;
import org.springframework.http.HttpStatus;
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

	private static final String MEMBER_OF = """
			 AND EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = :user)
			""";

	static final String VIEW = "projects:project:view";
	static final String UPDATE = "projects:project:update";
	static final String ARCHIVE = "projects:project:archive";
	static final String MANAGE_MEMBERS = "projects:member:manage";

	private final JdbcClient jdbc;
	private final ApplicationEventPublisher events;
	private final Clock clock;
	private final Users users;
	private final jakarta.validation.Validator validator;
	private final ProjectRoles roles;
	private final ProjectScopes scopes;

	ProjectService(JdbcClient jdbc, ApplicationEventPublisher events, Clock clock, Users users,
			jakarta.validation.Validator validator, ProjectRoles roles, ProjectScopes scopes) {
		this.roles = roles;
		this.scopes = scopes;
		this.jdbc = jdbc;
		this.events = events;
		this.clock = clock;
		this.users = users;
		this.validator = validator;
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
		// The creator manages the project; saved with the Member in this transaction.
		roles.give(actor, project.id(), actor, BuiltInRole.PROJECT_ADMIN.key());
		events.publishEvent(new ProjectCreated(project.id(), project.key(), actor));
		return withPeople(List.of(project)).getFirst();
	}

	/**
	 * The active (not Archived) projects the actor is a Member of, by lower-cased name, then by key (names need not be
	 * unique). Sorted here and not by the database, as the Roles are, so the order is the same on every database
	 * whatever its locale: a collation would skip spaces and punctuation, and its {@code lower()} differs from Java's.
	 */
	public List<ProjectView> listFor(UUID actor) {
		return withPeople(visibleTo(actor, false));
	}

	/** The User's Archived projects, in the same order (all of them for a holder of view at Scope All). */
	public List<ProjectView> listArchivedFor(UUID actor) {
		return withPeople(visibleTo(actor, true));
	}

	private static String state(boolean archived) {
		return archived ? "archived_at IS NOT NULL" : "archived_at IS NULL";
	}

	/**
	 * The projects the User is a Member of that are Archived or not, in the list's order (see listFor); what a User
	 * without view at Scope All sees, since only Members hold project roles.
	 */
	private List<Row> membersOf(UUID user, boolean archived) {
		return sorted(jdbc.sql(SELECT + "WHERE " + state(archived) + MEMBER_OF).param("user", user)
			.query(ProjectService::row).list());
	}

	/** The projects the User can see, Archived or not: all of them with {@code projects:project:view} at Scope All. */
	private List<Row> visibleTo(UUID user, boolean archived) {
		if (!scopes.filter(user, VIEW).allProjects()) return membersOf(user, archived);
		return sorted(jdbc.sql(SELECT + "WHERE " + state(archived)).query(ProjectService::row).list());
	}

	private static List<Row> sorted(List<Row> rows) {
		return rows.stream()
			.sorted(Comparator.comparing((Row project) -> project.name().toLowerCase(Locale.ROOT))
				.thenComparing(Row::key))
			.toList();
	}

	/**
	 * Renames and re-describes a project, by the fields {@code changes} holds: a field not sent is left as it is, a
	 * {@code null} description clears it. Fields follow the rules of creating (see CreateProject), checked by the same
	 * annotations, and the key is never changed. Who may is decided by {@link #requireCanChange}, before the body is
	 * looked at; an Archived project can't be changed at all.
	 */
	@Transactional
	public ProjectView edit(UUID actor, String key, ProjectsController.UpdateProject changes) {
		var stored = ProjectKeys.normalize(key).orElseThrow(ProjectNotFound::new);
		var found = jdbc.sql("SELECT id, archived_at IS NOT NULL AS archived FROM projects WHERE key = :key")
			.param("key", stored)
			.query((row, index) -> Map.entry(row.getObject("id", UUID.class), row.getBoolean("archived")))
			.optional().orElseThrow(ProjectNotFound::new);
		var id = found.getKey();
		requireCanChange(actor, id, UPDATE);
		if (found.getValue()) throw new ProjectArchived();
		var errors = new java.util.TreeMap<String, String>();
		if (changes.keySent()) errors.put("key", "The Project key can't be changed");
		var name = ProjectsController.CreateProject.cleanName(changes.name());
		var description = ProjectsController.CreateProject.cleanDescription(changes.description());
		if (changes.nameSent()) check("name", name, errors);
		if (changes.descriptionSent()) check("description", description, errors);
		if (!errors.isEmpty()) throw new InvalidFields(errors);
		if (changes.nameSent()) {
			jdbc.sql("UPDATE projects SET name = :name WHERE id = :id").param("name", name).param("id", id).update();
		}
		if (changes.descriptionSent()) {
			jdbc.sql("UPDATE projects SET description = :description WHERE id = :id")
				.param("description", description).param("id", id).update();
		}
		return open(actor, key);
	}

	/** Archives a project; one already Archived stays as it is (and keeps its time). */
	@Transactional
	public ProjectView archive(UUID actor, String key) {
		var id = changeableId(actor, key, ARCHIVE);
		jdbc.sql("UPDATE projects SET archived_at = :at WHERE id = :id AND archived_at IS NULL")
			.param("at", Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS))).param("id", id).update();
		return open(actor, key);
	}

	/** Restores a project; one that is not Archived stays as it is. */
	@Transactional
	public ProjectView restore(UUID actor, String key) {
		var id = changeableId(actor, key, ARCHIVE);
		jdbc.sql("UPDATE projects SET archived_at = NULL WHERE id = :id AND archived_at IS NOT NULL").param("id", id).update();
		return open(actor, key);
	}

	/** The project's id, once the single change decision allows the actor to change it. */
	private UUID changeableId(UUID actor, String key, String permission) {
		var stored = ProjectKeys.normalize(key).orElseThrow(ProjectNotFound::new);
		var id = jdbc.sql("SELECT id FROM projects WHERE key = :key").param("key", stored)
			.query(UUID.class).optional().orElseThrow(ProjectNotFound::new);
		requireCanChange(actor, id, permission);
		return id;
	}

	/** Checks one field against the annotations of CreateProject, so the rules and messages stay in one place. */
	private void check(String field, String value, Map<String, String> errors) {
		for (var violation : validator.validateValue(ProjectsController.CreateProject.class, field, value))
			errors.putIfAbsent(field, violation.getMessage());
	}

	@Override
	public List<ProjectSummary> memberProjects(UUID userId) {
		return membersOf(userId, false).stream().map(Row::summary).toList();
	}

	/** Unknown projects and projects the actor is not a Member of are both "not found". */
	public ProjectView open(UUID actor, String key) {
		var stored = ProjectKeys.normalize(key).orElseThrow(ProjectNotFound::new);
		var project = jdbc.sql(SELECT + "WHERE key = :key").param("key", stored)
			.query(ProjectService::row).optional().orElseThrow(ProjectNotFound::new);
		requireVisible(actor, project.id());
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

	/** A User sees a project as a Member, or with {@code projects:project:view} at Scope All; else "not found". */
	private void requireVisible(UUID actor, UUID projectId) {
		var visible = isMember(projectId, actor)
				|| scopes.scope(actor, projectId, VIEW).filter(scope -> scope == Scope.ALL).isPresent();
		if (!visible) throw new ProjectNotFound();
	}

	/**
	 * The single change decision: a User who can't see the project gets "not found", one who can see it but lacks the
	 * Permission gets "not allowed" ({@code 403}), whatever Scope it has.
	 */
	public void requireCanChange(UUID actor, UUID projectId, String permission) {
		requireVisible(actor, projectId);
		scopes.require(actor, projectId, permission);
	}

	/** A Member as the Members page shows them. */
	record MemberView(UUID id, String email, String displayName, String avatarUrl, String role, Instant addedAt) {
	}

	/** A project role that can be chosen, and whether the actor may give it. */
	record RoleOption(String key, String name, boolean assignable) {
	}

	/** A refused Member change: the status, the reason and, for a field, its error. */
	static class MemberRefused extends RuntimeException {
		final HttpStatus status;
		final Map<String, String> errors;

		MemberRefused(HttpStatus status, String message) {
			this(status, message, null);
		}

		MemberRefused(HttpStatus status, String message, Map<String, String> errors) {
			super(message);
			this.status = status;
			this.errors = errors;
		}
	}

	/** The Members, earliest added first, for anyone who can see the project. */
	public List<MemberView> members(UUID actor, String key) {
		var project = open(actor, key);
		var found = new java.util.ArrayList<Map.Entry<UUID, Instant>>();
		jdbc.sql("SELECT user_id, added_at FROM project_members WHERE project_id = :project ORDER BY added_at, user_id")
			.param("project", project.id())
			.query((row, index) -> found.add(Map.entry(row.getObject("user_id", UUID.class),
					row.getTimestamp("added_at").toInstant())))
			.list();
		return views(project.id(), found);
	}

	private List<MemberView> views(UUID projectId, List<Map.Entry<UUID, Instant>> found) {
		var held = roles.rolesIn(projectId);
		var people = users.findAllById(found.stream().map(Map.Entry::getKey).toList()).stream()
			.collect(Collectors.toMap(UserSummary::id, Function.identity()));
		return found.stream().filter(entry -> people.containsKey(entry.getKey())).map(entry -> {
			var user = people.get(entry.getKey());
			return new MemberView(user.id(), user.email(), user.displayName(), user.avatarUrl(),
					held.get(user.id()), entry.getValue());
		}).toList();
	}

	/** The project roles, each marked with whether the actor may give it; for a Member who manages Members. */
	public List<RoleOption> memberRoles(UUID actor, String key) {
		var id = changeableId(actor, key, MANAGE_MEMBERS);
		return roles.projectRoles().stream()
			.map(role -> new RoleOption(role.key(), role.name(), scopes.canGive(actor, id, role.key()))).toList();
	}

	@Transactional
	public MemberView addMember(UUID actor, String key, String email, String role) {
		var id = lockedForMembers(actor, key);
		requireProjectRole(role);
		var user = users.findByEmail(email).orElseThrow(() -> new MemberRefused(HttpStatus.NOT_FOUND,
				"No User has that email", Map.of("email", "No User has that email")));
		requireOthers(actor, user.id());
		requireCanGive(actor, id, role);
		if (isMember(id, user.id())) throw new MemberRefused(HttpStatus.CONFLICT, "This User is already a Member");
		var at = clock.instant().truncatedTo(ChronoUnit.MICROS);
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) VALUES (:project, :user, :at)")
			.param("project", id).param("user", user.id()).param("at", Timestamp.from(at)).update();
		roles.give(actor, id, user.id(), role);
		return views(id, List.of(Map.entry(user.id(), at))).getFirst();
	}

	@Transactional
	public MemberView changeMember(UUID actor, String key, UUID userId, String role) {
		var id = lockedForMembers(actor, key);
		requireProjectRole(role);
		var added = memberSince(id, userId);
		requireOthers(actor, userId);
		requireCanGive(actor, id, role);
		var current = roles.roleOf(id, userId);
		if (current.filter(role::equals).isEmpty()) {
			requireNotLastAdmin(id, current);
			if (current.isPresent()) roles.change(actor, id, userId, role);
			else roles.give(actor, id, userId, role);
		}
		return views(id, List.of(Map.entry(userId, added))).getFirst();
	}

	@Transactional
	public void removeMember(UUID actor, String key, UUID userId) {
		var id = lockedForMembers(actor, key);
		memberSince(id, userId);
		requireOthers(actor, userId);
		var current = roles.roleOf(id, userId);
		requireNotLastAdmin(id, current);
		jdbc.sql("DELETE FROM project_members WHERE project_id = :project AND user_id = :user")
			.param("project", id).param("user", userId).update();
		if (current.isPresent()) roles.remove(actor, id, userId);
		events.publishEvent(new MemberRemoved(id, userId));
	}

	/**
	 * The project's id once the actor may manage its Members and it is not Archived. The project row is locked until
	 * the transaction ends, so concurrent Member changes in one project take turns and the last-admin rule is
	 * checked against the Members as they really are.
	 */
	private UUID lockedForMembers(UUID actor, String key) {
		var id = changeableId(actor, key, MANAGE_MEMBERS);
		var archived = jdbc.sql("SELECT archived_at IS NOT NULL FROM projects WHERE id = :id FOR UPDATE")
			.param("id", id).query(Boolean.class).single();
		if (archived) throw new ProjectArchived();
		return id;
	}

	private void requireProjectRole(String role) {
		if (role == null || roles.projectRoles().stream().noneMatch(found -> found.key().equals(role))) {
			throw new InvalidFields(Map.of("role", "Choose a project role"));
		}
	}

	private static void requireOthers(UUID actor, UUID target) {
		if (actor.equals(target)) {
			throw new MemberRefused(HttpStatus.FORBIDDEN, "You can't change your own project role or membership");
		}
	}

	private void requireCanGive(UUID actor, UUID projectId, String role) {
		if (!scopes.canGive(actor, projectId, role)) {
			throw new MemberRefused(HttpStatus.FORBIDDEN, "You can't give a role with more access than you have");
		}
	}

	/** Removing or demoting the last Project admin leaves a project nobody can manage. */
	private void requireNotLastAdmin(UUID projectId, Optional<String> current) {
		var admin = BuiltInRole.PROJECT_ADMIN.key();
		if (current.filter(admin::equals).isPresent() && roles.countHolders(projectId, admin) <= 1) {
			throw new MemberRefused(HttpStatus.CONFLICT, "A project needs at least one Project admin");
		}
	}

	private Instant memberSince(UUID projectId, UUID userId) {
		return jdbc.sql("SELECT added_at FROM project_members WHERE project_id = :project AND user_id = :user")
			.param("project", projectId).param("user", userId)
			.query((row, index) -> row.getTimestamp("added_at").toInstant()).optional()
			.orElseThrow(() -> new MemberRefused(HttpStatus.NOT_FOUND, "Member not found"));
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

	/** Fields of a change that break the rules, by field name. */
	static class InvalidFields extends RuntimeException {
		final Map<String, String> errors;

		InvalidFields(Map<String, String> errors) {
			super("Some fields are invalid");
			this.errors = errors;
		}
	}

	static class ProjectArchived extends RuntimeException {
		ProjectArchived() {
			super("An Archived project can't be changed");
		}
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
