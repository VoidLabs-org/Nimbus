package com.nimbus.api.issues.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import com.nimbus.api.issues.IssueChanged;
import com.nimbus.api.issues.IssueCreated;
import com.nimbus.api.projects.ProjectSummary;
import com.nimbus.api.projects.Projects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates and opens Issues. See {@code docs/specs/issues.md} for the rules. */
@Service
@Transactional(readOnly = true)
class IssueService {

	private static final String SELECT = """
			SELECT i.id, i.number, i.type, i.title, i.description, i.priority, i.reporter_id, i.assignee_id,
			       i.created_at, i.updated_at, i.version, s.id AS status_id, s.name AS status_name,
			       s.category AS status_category
			FROM issues i JOIN issue_statuses s ON s.id = i.status_id
			""";

	private static final List<String[]> DEFAULT_STATUSES = List.of(new String[] { "To do", "TODO" },
			new String[] { "In progress", "IN_PROGRESS" }, new String[] { "Done", "DONE" });

	private final JdbcClient jdbc;
	private final Projects projects;
	private final Users users;
	private final IssueAccess access;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	IssueService(JdbcClient jdbc, Projects projects, Users users, IssueAccess access, ApplicationEventPublisher events,
			Clock clock) {
		this.jdbc = jdbc;
		this.projects = projects;
		this.users = users;
		this.access = access;
		this.events = events;
		this.clock = clock;
	}

	/** The controller has already checked the fields' shape. Unknown and non-Member projects are both "not found". */
	@Transactional
	IssueView create(UUID actor, String projectKey, NewIssue input) {
		var project = projects.findByKey(projectKey).orElseThrow(() -> new NotFound("Project not found"));
		access.require(actor, project.id(), IssueAccess.Action.CREATE);
		if (project.archived()) throw new Conflict("This project is archived, so it takes no new Issues", null);
		if (input.assigneeId() != null && !projects.isMember(project.id(), input.assigneeId())) {
			throw new InvalidField("assigneeId", "The Assignee must be a Member of the project");
		}

		var number = nextNumber(project.id());
		var statusId = firstToDoStatus(project.id());
		var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		var id = UUID.randomUUID();
		jdbc.sql("""
				INSERT INTO issues (id, project_id, number, type, title, description, priority, status_id, reporter_id,
				                    assignee_id, created_at, updated_at, version)
				VALUES (:id, :project, :number, :type, :title, :description, :priority, :status, :reporter, :assignee,
				        :at, :at, 0)
				""")
			.param("id", id).param("project", project.id()).param("number", number).param("type", input.type())
			.param("title", input.title()).param("description", input.description())
			.param("priority", input.priority()).param("status", statusId).param("reporter", actor)
			.param("assignee", input.assigneeId()).param("at", Timestamp.from(now)).update();
		jdbc.sql("INSERT INTO issue_history (id, issue_id, actor_id, at, field) VALUES (:id, :issue, :actor, :at, 'created')")
			.param("id", UUID.randomUUID()).param("issue", id).param("actor", actor).param("at", Timestamp.from(now))
			.update();
		events.publishEvent(new IssueCreated(project.id(), IssueKeys.format(project.key(), number)));
		return load(SELECT + "WHERE i.id = :id", Map.of("id", id), project).getFirst();
	}

	/** Unknown keys and Issues of projects the actor is not a Member of are both "not found". */
	IssueView open(UUID actor, String issueKey) {
		var target = resolve(actor, issueKey, IssueAccess.Action.VIEW);
		var found = load(SELECT + "WHERE i.project_id = :project AND i.number = :number",
				Map.of("project", target.project().id(), "number", target.number()), target.project());
		if (found.isEmpty()) throw new NotFound("Issue not found");
		return found.getFirst();
	}

	/**
	 * Edits title, description, type and priority; what is {@code null} stays as it is, and an empty description
	 * clears it. Title and description are guarded by {@code version}: a stale one is a {@code 409}.
	 */
	@Transactional
	IssueView edit(UUID actor, String issueKey, IssueEdit edit) {
		return change(actor, issueKey, edit.version(), current -> {
			var changes = new ArrayList<Change>();
			if (edit.title() != null) changes.add(new Change("title", current.title(), edit.title()));
			if (edit.description() != null) {
				changes.add(new Change("description", current.description(),
						edit.description().isEmpty() ? null : edit.description()));
			}
			if (edit.type() != null) changes.add(new Change("type", current.type(), edit.type()));
			if (edit.priority() != null) changes.add(new Change("priority", current.priority(), edit.priority()));
			return changes;
		});
	}

	/** Sets or clears ({@code null}) the Assignee, who must be a Member. Never conflicts. */
	@Transactional
	IssueView assign(UUID actor, String issueKey, UUID assigneeId) {
		return change(actor, issueKey, null, current -> {
			if (assigneeId != null && !projects.isMember(current.projectId(), assigneeId)) {
				throw new InvalidField("userId", "The Assignee must be a Member of the project");
			}
			return List.of(new Change("assignee", Objects.toString(current.assigneeId(), null),
					Objects.toString(assigneeId, null)));
		});
	}

	/** The Issue's history, newest first. Assignee changes carry the Users' names. */
	List<HistoryEntryView> history(UUID actor, String issueKey) {
		var target = resolve(actor, issueKey, IssueAccess.Action.VIEW);
		var rows = jdbc.sql("""
				SELECT h.id, h.actor_id, h.at, h.field, h.before_value, h.after_value
				FROM issue_history h JOIN issues i ON i.id = h.issue_id
				WHERE i.project_id = :project AND i.number = :number
				ORDER BY h.at DESC, h.field DESC, h.id DESC
				""")
			.param("project", target.project().id()).param("number", target.number())
			.query((row, index) -> new HistoryRow(row.getObject("id", UUID.class), row.getObject("actor_id", UUID.class),
					row.getTimestamp("at").toInstant(), row.getString("field"), row.getString("before_value"),
					row.getString("after_value")))
			.list();
		var ids = new java.util.HashSet<UUID>();
		for (var row : rows) {
			if (row.actorId() != null) ids.add(row.actorId());
			if (row.field().equals("assignee")) {
				var before = parseId(row.before());
				var after = parseId(row.after());
				if (before != null) ids.add(before);
				if (after != null) ids.add(after);
			}
		}
		var people = users.findAllById(ids).stream().collect(Collectors.toMap(UserSummary::id, Function.identity()));
		Function<String, String> name = value -> {
			if (value == null) return null;
			var id = parseId(value);
			return id != null && people.containsKey(id) ? people.get(id).displayName() : "Unknown user";
		};
		return rows.stream().map(row -> {
			var assignee = row.field().equals("assignee");
			var description = row.field().equals("description");
			var actorUser = row.actorId() == null ? null : people.get(row.actorId());
			return new HistoryEntryView(row.id(), actorUser == null ? null : person(actorUser), row.at(), row.field(),
					assignee ? name.apply(row.before()) : description ? null : row.before(),
					assignee ? name.apply(row.after()) : description ? null : row.after());
		}).toList();
	}

	/** The id in a history value, or {@code null} if it isn't one. */
	private static UUID parseId(String value) {
		if (value == null) return null;
		try {
			return UUID.fromString(value);
		}
		catch (IllegalArgumentException e) {
			return null;
		}
	}

	private Target resolve(UUID actor, String issueKey, IssueAccess.Action action) {
		var parsed = IssueKeys.parse(issueKey).orElseThrow(() -> new NotFound("Issue not found"));
		var project = projects.findByKey(parsed.projectKey()).orElseThrow(() -> new NotFound("Issue not found"));
		try {
			access.require(actor, project.id(), action);
		}
		catch (NotFound e) {
			throw new NotFound("Issue not found");
		}
		return new Target(project, parsed.number());
	}

	/**
	 * The shared path of every edit: not found, then the Issue row is locked, then archived (read again under the
	 * lock, so an archive that committed meanwhile is seen), then the changes that really differ are found. If one
	 * of them is a title or description change, the version must match; an edit that changes nothing never
	 * conflicts. The differing changes are written with one history entry each and published as one event. The lock
	 * means two edits never both pass the same version. Only title and description changes raise the version, so
	 * quick changes never make someone's open text edit stale.
	 */
	private IssueView change(UUID actor, String issueKey, Long version, Function<Current, List<Change>> changes) {
		var target = resolve(actor, issueKey, IssueAccess.Action.EDIT);
		var project = target.project();
		var current = jdbc.sql("""
				SELECT id, project_id, title, description, type, priority, assignee_id, version
				FROM issues WHERE project_id = :project AND number = :number FOR UPDATE
				""")
			.param("project", project.id()).param("number", target.number())
			.query((row, index) -> new Current(row.getObject("id", UUID.class), row.getObject("project_id", UUID.class),
					row.getString("title"), row.getString("description"), row.getString("type"),
					row.getString("priority"), row.getObject("assignee_id", UUID.class), row.getLong("version")))
			.optional().orElseThrow(() -> new NotFound("Issue not found"));
		var fresh = projects.findByKey(project.key()).orElseThrow(() -> new NotFound("Issue not found"));
		if (fresh.archived()) throw new Conflict("This project is archived, so its Issues can't be changed", null);

		var differing = changes.apply(current).stream().filter(c -> !Objects.equals(c.before(), c.after())).toList();
		if (differing.stream().anyMatch(c -> c.field().equals("title") || c.field().equals("description"))) {
			if (version == null) throw new InvalidField("version", "Send the version you opened");
			if (version != current.version()) {
				throw new Conflict("This Issue changed since you opened it", "issue_changed");
			}
		}
		if (!differing.isEmpty()) {
			var now = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS));
			var update = new StringBuilder("UPDATE issues SET updated_at = :at");
			var params = new java.util.HashMap<String, Object>();
			params.put("at", now);
			params.put("id", current.id());
			for (var c : differing) {
				var assignee = c.field().equals("assignee");
				update.append(", ").append(assignee ? "assignee_id" : c.field()).append(" = :").append(c.field());
				params.put(c.field(), assignee && c.after() != null ? UUID.fromString(c.after()) : c.after());
			}
			if (differing.stream().anyMatch(c -> c.field().equals("title") || c.field().equals("description"))) {
				update.append(", version = version + 1");
			}
			jdbc.sql(update + " WHERE id = :id").params(params).update();
			for (var c : differing) {
				// Descriptions are up to 50,000 characters and the history only says they changed, so no values are kept.
				var keepValues = !c.field().equals("description");
				jdbc.sql("""
						INSERT INTO issue_history (id, issue_id, actor_id, at, field, before_value, after_value)
						VALUES (:id, :issue, :actor, :at, :field, :before, :after)
						""")
					.param("id", UUID.randomUUID()).param("issue", current.id()).param("actor", actor)
					.param("at", now).param("field", c.field()).param("before", keepValues ? c.before() : null)
					.param("after", keepValues ? c.after() : null).update();
			}
			events.publishEvent(new IssueChanged(project.id(), IssueKeys.format(project.key(), target.number()),
					differing.stream().map(Change::field).toList()));
		}
		return load(SELECT + "WHERE i.id = :id", Map.of("id", current.id()), project).getFirst();
	}

	/** One page of the project's Issues that match the filters. Unknown and non-Member projects are both "not found". */
	IssuePageView find(UUID actor, String projectKey, IssueFilter filter) {
		var project = projects.findByKey(projectKey).orElseThrow(() -> new NotFound("Project not found"));
		access.require(actor, project.id(), IssueAccess.Action.VIEW);

		var where = new StringBuilder("WHERE i.project_id = :project");
		var params = new java.util.HashMap<String, Object>();
		params.put("project", project.id());
		if (filter.status() != null) {
			where.append(" AND lower(s.name) = lower(:status)");
			params.put("status", filter.status());
		}
		if (filter.category() != null) {
			where.append(" AND s.category = :category");
			params.put("category", filter.category());
		}
		if (filter.type() != null) {
			where.append(" AND i.type = :type");
			params.put("type", filter.type());
		}
		if (filter.priority() != null) {
			where.append(" AND i.priority = :priority");
			params.put("priority", filter.priority());
		}
		if (filter.unassigned()) {
			where.append(" AND i.assignee_id IS NULL");
		}
		else if (filter.assigneeId() != null) {
			where.append(" AND i.assignee_id = :assignee");
			params.put("assignee", filter.assigneeId());
		}
		var words = filter.words();
		for (int index = 0; index < words.size(); index++) {
			where.append(" AND i.title ILIKE :word").append(index).append(" ESCAPE '\\'");
			params.put("word" + index, "%" + words.get(index).replaceAll("([\\\\%_])", "\\\\$1") + "%");
		}

		var total = jdbc.sql("SELECT count(*) FROM issues i JOIN issue_statuses s ON s.id = i.status_id " + where)
			.params(params).query(Long.class).single();
		var order = switch (filter.sort()) {
			case "created" -> "i.created_at DESC, i.number DESC";
			case "priority" -> "CASE i.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, "
					+ "i.updated_at DESC, i.number DESC";
			default -> "i.updated_at DESC, i.number DESC";
		};
		params.put("limit", filter.size());
		params.put("offset", (long) filter.page() * filter.size());
		var items = load(SELECT + where + " ORDER BY " + order + " LIMIT :limit OFFSET :offset", params, project);
		return new IssuePageView(items, total, filter.page(), filter.size());
	}

	/**
	 * Takes the next number under a row lock that is held until the transaction ends, so concurrent creates queue
	 * up and get distinct numbers. The first Statuses are created while holding it, so they are created once.
	 */
	private int nextNumber(UUID projectId) {
		jdbc.sql("INSERT INTO issue_counters (project_id, last_number) VALUES (:project, 0) ON CONFLICT DO NOTHING")
			.param("project", projectId).update();
		return jdbc.sql("UPDATE issue_counters SET last_number = last_number + 1 WHERE project_id = :project RETURNING last_number")
			.param("project", projectId).query(Integer.class).single();
	}

	/** The first Status, in order, in the To do category; the project's default Statuses are made if it has none. */
	private UUID firstToDoStatus(UUID projectId) {
		var existing = jdbc.sql("SELECT count(*) FROM issue_statuses WHERE project_id = :project")
			.param("project", projectId).query(Long.class).single();
		if (existing == 0) {
			for (int position = 0; position < DEFAULT_STATUSES.size(); position++) {
				jdbc.sql("INSERT INTO issue_statuses (id, project_id, name, category, position) VALUES (:id, :project, :name, :category, :position)")
					.param("id", UUID.randomUUID()).param("project", projectId)
					.param("name", DEFAULT_STATUSES.get(position)[0]).param("category", DEFAULT_STATUSES.get(position)[1])
					.param("position", position).update();
			}
		}
		return jdbc.sql("SELECT id FROM issue_statuses WHERE project_id = :project AND category = 'TODO' ORDER BY position LIMIT 1")
			.param("project", projectId).query(UUID.class).single();
	}

	private List<IssueView> load(String sql, Map<String, ?> params, ProjectSummary project) {
		var rows = jdbc.sql(sql).params(params).query((row, index) -> new Row(row.getObject("id", UUID.class),
				row.getInt("number"), row.getString("type"), row.getString("title"), row.getString("description"),
				row.getString("priority"), row.getObject("reporter_id", UUID.class),
				row.getObject("assignee_id", UUID.class), row.getTimestamp("created_at").toInstant(),
				row.getTimestamp("updated_at").toInstant(), row.getLong("version"),
				new StatusView(row.getObject("status_id", UUID.class), row.getString("status_name"),
						row.getString("status_category"))))
			.list();
		var people = users.findAllById(rows.stream().flatMap(row -> Stream.of(row.reporterId(), row.assigneeId()))
			.filter(Objects::nonNull).distinct().toList()).stream()
			.collect(Collectors.toMap(UserSummary::id, Function.identity()));
		return rows.stream().map(row -> new IssueView(row.id(), IssueKeys.format(project.key(), row.number()),
				row.number(), row.type(), row.title(), row.description(), row.priority(), row.status(),
				person(people.get(row.reporterId())), row.assigneeId() == null ? null : person(people.get(row.assigneeId())),
				row.createdAt(), row.updatedAt(), row.version())).toList();
	}

	private static PersonView person(UserSummary user) {
		return new PersonView(user.id(), user.displayName(), user.avatarUrl());
	}

	/** {@code unassigned} wins over {@code assigneeId}; the controller sets at most one of them. */
	record IssueFilter(String status, String category, String type, String priority, UUID assigneeId,
			boolean unassigned, List<String> words, String sort, int page, int size) {
	}

	record IssuePageView(List<IssueView> items, long total, int page, int size) {
	}

	/** {@code null} leaves a field as it is; an empty description clears it. */
	record IssueEdit(String title, String description, String type, String priority, Long version) {
	}

	record HistoryEntryView(UUID id, PersonView actor, Instant at, String field, String before, String after) {
	}

	private record Target(ProjectSummary project, int number) {
	}

	private record Current(UUID id, UUID projectId, String title, String description, String type, String priority,
			UUID assigneeId, long version) {
	}

	private record Change(String field, String before, String after) {
	}

	private record HistoryRow(UUID id, UUID actorId, Instant at, String field, String before, String after) {
	}

	record NewIssue(String type, String title, String description, String priority, UUID assigneeId) {
	}

	private record Row(UUID id, int number, String type, String title, String description, String priority,
			UUID reporterId, UUID assigneeId, Instant createdAt, Instant updatedAt, long version, StatusView status) {
	}

	record StatusView(UUID id, String name, String category) {
	}

	record PersonView(UUID id, String displayName, String avatarUrl) {
	}

	record IssueView(UUID id, String key, int number, String type, String title, String description, String priority,
			StatusView status, PersonView reporter, PersonView assignee, Instant createdAt, Instant updatedAt,
			long version) {
	}

	static class NotFound extends RuntimeException {
		NotFound(String message) {
			super(message);
		}
	}

	static class Conflict extends RuntimeException {
		private final String code;

		Conflict(String message, String code) {
			super(message);
			this.code = code;
		}

		/** The machine-readable reason sent to clients, or {@code null}. */
		String code() {
			return code;
		}
	}

	static class InvalidFields extends RuntimeException {
		private final Map<String, String> errors;

		InvalidFields(Map<String, String> errors) {
			super("Some fields are invalid");
			this.errors = errors;
		}

		Map<String, String> errors() {
			return errors;
		}
	}

	static class InvalidField extends RuntimeException {
		private final String field;

		InvalidField(String field, String message) {
			super(message);
			this.field = field;
		}

		String field() {
			return field;
		}
	}
}
