package com.nimbus.api.issues.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
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
		if (project.archived()) throw new Conflict("This project is archived, so it takes no new Issues");
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
		var parsed = IssueKeys.parse(issueKey).orElseThrow(() -> new NotFound("Issue not found"));
		var project = projects.findByKey(parsed.projectKey()).orElseThrow(() -> new NotFound("Issue not found"));
		try {
			access.require(actor, project.id(), IssueAccess.Action.VIEW);
		}
		catch (NotFound e) {
			throw new NotFound("Issue not found");
		}
		var found = load(SELECT + "WHERE i.project_id = :project AND i.number = :number",
				Map.of("project", project.id(), "number", parsed.number()), project);
		if (found.isEmpty()) throw new NotFound("Issue not found");
		return found.getFirst();
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
		Conflict(String message) {
			super(message);
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
