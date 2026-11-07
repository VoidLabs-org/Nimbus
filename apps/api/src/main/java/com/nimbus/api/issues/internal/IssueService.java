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

import com.nimbus.api.access.Scope;
import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import com.nimbus.api.issues.IssueChanged;
import com.nimbus.api.issues.IssueCreated;
import com.nimbus.api.issues.IssueDeleted;
import com.nimbus.api.issues.Issues;
import com.nimbus.api.issues.ProjectStatus;
import com.nimbus.api.projects.ProjectSummary;
import com.nimbus.api.projects.Projects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates and opens Issues. See {@code docs/specs/issues.md} for the rules. */
@Service
@Transactional(readOnly = true)
class IssueService implements Issues {

	private static final String SELECT = """
			SELECT i.id, i.number, i.type, i.title, i.description, i.priority, i.reporter_id, i.assignee_id,
			       i.created_at, i.updated_at, i.version, s.id AS status_id, s.name AS status_name,
			       s.category AS status_category
			FROM issues i JOIN issue_statuses s ON s.id = i.status_id
			""";

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
		// A Status chosen on create (a Board column's Add issue) must be one of the project's own.
		var statusId = input.statusId() == null ? firstToDoStatus(project.id())
				: jdbc.sql("SELECT id FROM issue_statuses WHERE id = :id AND project_id = :project")
					.param("id", input.statusId()).param("project", project.id()).query(UUID.class).optional()
					.orElseThrow(() -> new InvalidField("statusId", "Choose one of the project's Statuses"));
		var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		var id = UUID.randomUUID();
		// Last in the project's order, so at the bottom of its column. nextNumber's lock is held, so no other Issue
		// of the project can take the same key meanwhile.
		var last = jdbc.sql("SELECT max(rank) FROM issues WHERE project_id = :project").param("project", project.id())
			.query(String.class).list().getFirst(); // null for the project's first Issue
		jdbc.sql("""
				INSERT INTO issues (id, project_id, number, type, title, description, priority, status_id, reporter_id,
				                    assignee_id, created_at, updated_at, version, rank)
				VALUES (:id, :project, :number, :type, :title, :description, :priority, :status, :reporter, :assignee,
				        :at, :at, 0, :rank)
				""")
			.param("rank", RankKeys.between(last, null))
			.param("id", id).param("project", project.id()).param("number", number).param("type", input.type())
			.param("title", input.title()).param("description", input.description())
			.param("priority", input.priority()).param("status", statusId).param("reporter", actor)
			.param("assignee", input.assigneeId()).param("at", Timestamp.from(now)).update();
		jdbc.sql("INSERT INTO issue_history (id, issue_id, actor_id, at, field) VALUES (:id, :issue, :actor, :at, 'created')")
			.param("id", UUID.randomUUID()).param("issue", id).param("actor", actor).param("at", Timestamp.from(now))
			.update();
		events.publishEvent(new IssueCreated(project.id(), IssueKeys.format(project.key(), number), actor,
			input.title(), actor, input.assigneeId()));
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
			if (edit.title() != null) changes.add(new Change(Field.TITLE, current.title(), edit.title()));
			if (edit.description() != null) {
				changes.add(new Change(Field.DESCRIPTION, current.description(),
						edit.description().isEmpty() ? null : edit.description()));
			}
			if (edit.type() != null) changes.add(new Change(Field.TYPE, current.type(), edit.type()));
			if (edit.priority() != null) changes.add(new Change(Field.PRIORITY, current.priority(), edit.priority()));
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
			return List.of(new Change(Field.ASSIGNEE, Objects.toString(current.assigneeId(), null),
					Objects.toString(assigneeId, null)));
		});
	}

	/** Moves to any Status of the Issue's project; a Status of another project is a {@code 400}. Never conflicts. */
	@Override
	@Transactional
	public ProjectStatus changeStatus(UUID actor, String issueKey, UUID statusId) {
		var target = new ProjectStatus[1];
		move(actor, issueKey, statusId, target);
		return target[0];
	}

	/** The one move, for the endpoint and {@link #changeStatus}. */
	@Transactional
	IssueView move(UUID actor, String issueKey, UUID statusId) {
		return move(actor, issueKey, statusId, new ProjectStatus[1]);
	}

	/** Also hands back the Status moved to (with its position) in {@code moved[0]}, found in the one read of them. */
	private IssueView move(UUID actor, String issueKey, UUID statusId, ProjectStatus[] moved) {
		return change(actor, issueKey, null, current -> {
			var target = statusId == null ? null : statusesOf(current.projectId()).stream()
				.filter(status -> status.id().equals(statusId)).findFirst().orElse(null);
			if (target == null) throw new InvalidField("statusId", "Choose a Status of the Issue's project");
			moved[0] = target;
			// Compared by id, so only a move to another Status counts as a change, whatever the names are.
			if (target.id().equals(current.statusId())) return List.of();
			return List.of(new Change(Field.STATUS, current.statusName(), target.name(), target.id(),
					current.statusCategory(), target.category()));
		});
	}

	/**
	 * Removes the Issue and its history for good and keeps a deletion record. Locks the Issue row like every edit,
	 * so a delete never races an edit; the number stays used because {@code issue_counters} only goes up.
	 */
	@Transactional
	void delete(UUID actor, String issueKey) {
		var target = resolve(actor, issueKey, IssueAccess.Action.DELETE);
		var project = target.project();
		var found = jdbc.sql("SELECT id, title, reporter_id, assignee_id FROM issues WHERE project_id = :project AND number = :number FOR UPDATE")
			.param("project", project.id()).param("number", target.number())
			.query((row, index) -> new Deletable(row.getObject("id", UUID.class), row.getString("title"),
					row.getObject("reporter_id", UUID.class), row.getObject("assignee_id", UUID.class))).optional()
			.orElseThrow(() -> new NotFound("Issue not found"));
		access.requireOwn(target.scope(), IssueAccess.Action.DELETE, actor, found.reporterId(), null);
		var fresh = projects.findByKey(project.key()).orElseThrow(() -> new NotFound("Issue not found"));
		if (fresh.archived()) throw new Conflict("This project is archived, so its Issues can't be deleted", null);

		var key = IssueKeys.format(project.key(), target.number());
		var at = clock.instant().truncatedTo(ChronoUnit.MICROS);
		jdbc.sql("""
				INSERT INTO issue_deletions (id, project_id, issue_key, title, actor_id, deleted_at)
				VALUES (:id, :project, :key, :title, :actor, :at)
				""")
			.param("id", UUID.randomUUID()).param("project", project.id()).param("key", key)
			.param("title", found.title()).param("actor", actor)
			.param("at", Timestamp.from(at)).update();
		jdbc.sql("DELETE FROM issues WHERE id = :id").param("id", found.id()).update();
		events.publishEvent(new IssueDeleted(project.id(), fresh.key(), fresh.name(), key, actor, found.title(),
			found.reporterId(), found.assigneeId(), at));
	}

	@Override
	public List<ProjectStatus> statuses(UUID actor, UUID projectId) {
		access.require(actor, projectId, IssueAccess.Action.VIEW);
		return statusesOf(projectId);
	}

	/** The project's Statuses in order, for a Member. Unknown and non-Member projects are both "not found". */
	List<ProjectStatus> statuses(UUID actor, String projectKey) {
		var project = projects.findByKey(projectKey).orElseThrow(() -> new NotFound("Project not found"));
		access.require(actor, project.id(), IssueAccess.Action.VIEW);
		return statusesOf(project.id());
	}

	private List<ProjectStatus> statusesOf(UUID projectId) {
		return jdbc.sql("SELECT id, name, category, position FROM issue_statuses WHERE project_id = :project ORDER BY position")
			.param("project", projectId)
			.query((row, index) -> new ProjectStatus(row.getObject("id", UUID.class), row.getString("name"),
					row.getString("category"), row.getInt("position")))
			.list();
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
		// Every Issue has a "created" entry, so none means the Issue does not exist (or is deleted).
		if (rows.isEmpty()) throw new NotFound("Issue not found");
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
			return new Target(project, parsed.number(), access.require(actor, project.id(), action));
		}
		catch (NotFound e) {
			throw new NotFound("Issue not found");
		}
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
				SELECT i.id, i.project_id, i.reporter_id, i.title, i.description, i.type, i.priority, i.assignee_id, i.version, i.status_id,
				       (SELECT s.name FROM issue_statuses s WHERE s.id = i.status_id) AS status_name,
				       (SELECT s.category FROM issue_statuses s WHERE s.id = i.status_id) AS status_category
				FROM issues i WHERE i.project_id = :project AND i.number = :number FOR UPDATE
				""")
			.param("project", project.id()).param("number", target.number())
			.query((row, index) -> new Current(row.getObject("id", UUID.class), row.getObject("project_id", UUID.class),
					row.getObject("reporter_id", UUID.class),
					row.getString("title"), row.getString("description"), row.getString("type"),
					row.getString("priority"), row.getObject("assignee_id", UUID.class), row.getLong("version"),
					row.getObject("status_id", UUID.class), row.getString("status_name"), row.getString("status_category")))
			.optional().orElseThrow(() -> new NotFound("Issue not found"));
		access.requireOwn(target.scope(), IssueAccess.Action.EDIT, actor, current.reporterId(), current.assigneeId());
		var fresh = projects.findByKey(project.key()).orElseThrow(() -> new NotFound("Issue not found"));
		if (fresh.archived()) throw new Conflict("This project is archived, so its Issues can't be changed", null);

		var differing = changes.apply(current).stream().filter(c -> !Objects.equals(c.before(), c.after())).toList();
		var versioned = differing.stream().anyMatch(c -> c.field().versioned());
		if (versioned) {
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
				var name = c.field().label();
				update.append(", ").append(c.field().column()).append(" = :").append(name);
				params.put(name, c.field() == Field.STATUS ? c.value()
						: c.field() == Field.ASSIGNEE && c.after() != null ? UUID.fromString(c.after()) : c.after());
			}
			if (versioned) update.append(", version = version + 1");
			jdbc.sql(update + " WHERE id = :id").params(params).update();
			for (var c : differing) {
				var keepValues = c.field().keepsValues();
				jdbc.sql("""
						INSERT INTO issue_history (id, issue_id, actor_id, at, field, before_value, after_value)
						VALUES (:id, :issue, :actor, :at, :field, :before, :after)
						""")
					.param("id", UUID.randomUUID()).param("issue", current.id()).param("actor", actor)
					.param("at", now).param("field", c.field().label()).param("before", keepValues ? c.before() : null)
					.param("after", keepValues ? c.after() : null).update();
			}
			var titleAfter = differing.stream().filter(c -> c.field() == Field.TITLE).map(Change::after).findFirst()
				.orElse(current.title());
			var assigneeAfter = differing.stream().filter(c -> c.field() == Field.ASSIGNEE).findFirst()
				.map(c -> parseId(c.after())).orElse(current.assigneeId());
			events.publishEvent(new IssueChanged(project.id(), IssueKeys.format(project.key(), target.number()), actor,
					titleAfter, current.reporterId(), assigneeAfter,
					differing.stream().map(c -> new IssueChanged.Change(c.field().label(),
							c.field().keepsValues() ? c.before() : null, c.field().keepsValues() ? c.after() : null,
							c.beforeCategory() == null ? null
								: new IssueChanged.Change.Categories(c.beforeCategory(), c.afterCategory()))).toList(),
					now.toInstant()));
		}
		return load(SELECT + "WHERE i.id = :id", Map.of("id", current.id()), project).getFirst();
	}

	/** One page of the project's Issues that match the filters. Unknown and non-Member projects are both "not found". */
	IssuePageView find(UUID actor, String projectKey, IssueFilter filter) {
		var project = projects.findByKey(projectKey).orElseThrow(() -> new NotFound("Project not found"));
		access.require(actor, project.id(), IssueAccess.Action.VIEW);

		var params = new java.util.HashMap<String, Object>();
		var where = where(project.id(), filter, null, params);

		var total = jdbc.sql(COUNT + where).params(params).query(Long.class).single();
		var order = switch (filter.sort()) {
			case "created" -> "i.created_at DESC, i.number DESC";
			case "priority" -> "CASE i.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, "
					+ "i.updated_at DESC, i.number DESC";
			// Ranks are unique in a project; the id only keeps paging stable should that ever not hold.
			case "rank" -> "i.rank, i.id";
			default -> "i.updated_at DESC, i.number DESC";
		};
		params.put("limit", filter.size());
		params.put("offset", (long) filter.page() * filter.size());
		var items = load(SELECT + where + " ORDER BY " + order + " LIMIT :limit OFFSET :offset", params, project);
		return new IssuePageView(items, total, filter.page(), filter.size());
	}

	/**
	 * How many of the project's Issues match the filters, and how many each value of Status, category, type and
	 * priority would match. A field's counts leave out that field's own filter, so with Type Bug chosen the other
	 * types still show what choosing them instead would give. Values no Issue has are left out (zero). Sorting and
	 * paging don't apply. Unknown and non-Member projects are both "not found".
	 */
	IssueCountsView counts(UUID actor, String projectKey, IssueFilter filter) {
		var project = projects.findByKey(projectKey).orElseThrow(() -> new NotFound("Project not found"));
		access.require(actor, project.id(), IssueAccess.Action.VIEW);

		// One pass: the filters that narrow every count (assignee, words) go in WHERE; the four fields' filters go in
		// FILTER clauses, each field's own left out of its counts. GROUPING SETS gives a row per value of each field.
		var params = new java.util.HashMap<String, Object>();
		var base = where(project.id(), filter, "*", params);
		var facets = new java.util.LinkedHashMap<String, String>();
		if (filter.status() != null) {
			facets.put("status", "lower(s.name) = lower(:status)");
			params.put("status", filter.status());
		}
		if (filter.category() != null) {
			facets.put("category", "s.category = :category");
			params.put("category", filter.category());
		}
		if (filter.type() != null) {
			facets.put("type", "i.type = :type");
			params.put("type", filter.type());
		}
		if (filter.priority() != null) {
			facets.put("priority", "i.priority = :priority");
			params.put("priority", filter.priority());
		}
		var sql = "SELECT GROUPING(i.status_id) AS by_status, GROUPING(s.category) AS by_category, "
				+ "GROUPING(i.type) AS by_type, GROUPING(i.priority) AS by_priority, "
				+ "i.status_id::text AS status, s.category, i.type, i.priority, "
				+ "count(*) FILTER (WHERE " + allBut(facets, null) + ") AS total, "
				+ "count(*) FILTER (WHERE " + allBut(facets, "status") + ") AS n_status, "
				+ "count(*) FILTER (WHERE " + allBut(facets, "category") + ") AS n_category, "
				+ "count(*) FILTER (WHERE " + allBut(facets, "type") + ") AS n_type, "
				+ "count(*) FILTER (WHERE " + allBut(facets, "priority") + ") AS n_priority "
				+ JOINED + base
				+ " GROUP BY GROUPING SETS ((i.status_id), (s.category), (i.type), (i.priority), ())";
		var total = new long[1];
		var statuses = new java.util.LinkedHashMap<String, Long>();
		var categories = new java.util.LinkedHashMap<String, Long>();
		var types = new java.util.LinkedHashMap<String, Long>();
		var priorities = new java.util.LinkedHashMap<String, Long>();
		jdbc.sql(sql).params(params).query((row, index) -> {
			if (row.getInt("by_status") == 0) put(statuses, row.getString("status"), row.getLong("n_status"));
			else if (row.getInt("by_category") == 0) put(categories, row.getString("category"), row.getLong("n_category"));
			else if (row.getInt("by_type") == 0) put(types, row.getString("type"), row.getLong("n_type"));
			else if (row.getInt("by_priority") == 0) put(priorities, row.getString("priority"), row.getLong("n_priority"));
			else total[0] = row.getLong("total");
			return null;
		}).list();
		return new IssueCountsView(total[0], statuses, categories, types, priorities);
	}

	/**
	 * Each active project the actor is a Member of, in the Projects list's order, with its Issue totals: all of them,
	 * those in a Done Status, and when an Issue last changed or was deleted ({@code null} with neither). One grouped
	 * query for all the projects, so the Projects table doesn't ask once per project. Membership is all that viewing
	 * Issues needs (see {@link IssueAccess}), so every project listed may be shown.
	 */
	List<ProjectStatsView> projectStats(UUID actor) {
		var mine = projects.memberProjects(actor);
		if (mine.isEmpty()) return List.of();
		var ids = mine.stream().map(ProjectSummary::id).toList();
		record Totals(long total, long done, Instant updated) {
		}
		var totals = new java.util.HashMap<UUID, Totals>();
		jdbc.sql("""
				SELECT i.project_id, count(*) AS total, count(*) FILTER (WHERE s.category = 'DONE') AS done,
				max(i.updated_at) AS updated
				FROM issues i JOIN issue_statuses s ON s.id = i.status_id
				WHERE i.project_id IN (:ids)
				GROUP BY i.project_id
				""").param("ids", ids).query((row, index) -> totals.put(row.getObject("project_id", UUID.class),
						new Totals(row.getLong("total"), row.getLong("done"), row.getTimestamp("updated").toInstant())))
			.list();
		var deleted = new java.util.HashMap<UUID, Instant>();
		jdbc.sql("""
				SELECT project_id, max(deleted_at) AS deleted FROM issue_deletions
				WHERE project_id IN (:ids) GROUP BY project_id
				""").param("ids", ids)
			.query((row, index) -> deleted.put(row.getObject("project_id", UUID.class),
					row.getTimestamp("deleted").toInstant()))
			.list();
		return mine.stream().map(project -> {
			var counted = totals.getOrDefault(project.id(), new Totals(0, 0, null));
			var gone = deleted.get(project.id());
			var updated = counted.updated() == null ? gone
					: gone == null || counted.updated().isAfter(gone) ? counted.updated() : gone;
			return new ProjectStatsView(project.key(), counted.total(), counted.done(), updated);
		}).toList();
	}

	/** Every field filter but {@code field}'s, joined with AND; TRUE when none is left. */
	private static String allBut(Map<String, String> facets, String field) {
		var kept = facets.entrySet().stream().filter(entry -> !entry.getKey().equals(field)).map(Map.Entry::getValue)
			.toList();
		return kept.isEmpty() ? "TRUE" : String.join(" AND ", kept);
	}

	/** Values with no match are left out. */
	private static void put(Map<String, Long> counts, String value, long count) {
		if (count > 0) counts.put(value, count);
	}

	private static boolean keep(String field, String skip) {
		return skip == null || !(skip.equals(field) || skip.equals("*"));
	}

	private static final String JOINED = "FROM issues i JOIN issue_statuses s ON s.id = i.status_id ";

	private static final String COUNT = "SELECT count(*) " + JOINED;

	/**
	 * The WHERE clause for the project's Issues matching {@code filter}, its values put in {@code params}.
	 * {@code skip} names one of status, category, type and priority to leave out, or {@code *} for all four.
	 */
	private static String where(UUID projectId, IssueFilter filter, String skip, Map<String, Object> params) {
		var where = new StringBuilder("WHERE i.project_id = :project");
		params.put("project", projectId);
		if (filter.status() != null && keep("status", skip)) {
			where.append(" AND lower(s.name) = lower(:status)");
			params.put("status", filter.status());
		}
		if (filter.category() != null && keep("category", skip)) {
			where.append(" AND s.category = :category");
			params.put("category", filter.category());
		}
		if (filter.type() != null && keep("type", skip)) {
			where.append(" AND i.type = :type");
			params.put("type", filter.type());
		}
		if (filter.priority() != null && keep("priority", skip)) {
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
		return where.toString();
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
		DefaultStatuses.ensure(jdbc, projectId);
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

	/** A project's Issue totals for the Projects table; {@code updatedAt} is {@code null} when nothing happened yet. */
	record ProjectStatsView(String projectKey, long total, long done, Instant updatedAt) {
	}

	/** Matching Issues, and per value of each field; {@code statuses} is keyed by Status id. */
	record IssueCountsView(long total, Map<String, Long> statuses, Map<String, Long> categories,
			Map<String, Long> types, Map<String, Long> priorities) {
	}

	/** {@code null} leaves a field as it is; an empty description clears it. */
	record IssueEdit(String title, String description, String type, String priority, Long version) {
	}

	record HistoryEntryView(UUID id, PersonView actor, Instant at, String field, String before, String after) {
	}

	private record Target(ProjectSummary project, int number, Scope scope) {
	}

	private record Deletable(UUID id, String title, UUID reporterId, UUID assigneeId) {
	}

	private record Current(UUID id, UUID projectId, UUID reporterId, String title, String description, String type, String priority,
			UUID assigneeId, long version, UUID statusId, String statusName, String statusCategory) {
	}

	/** {@code value} is what the column is set to when it isn't {@code after}: a Status keeps its name in history. */
	private record Change(Field field, String before, String after, Object value, String beforeCategory,
			String afterCategory) {
		Change(Field field, String before, String after) {
			this(field, before, after, null, null, null);
		}
	}

	/**
	 * What an edit can change: the column it sets, whether it is guarded by (and raises) the version, and whether its
	 * history keeps the values. Descriptions are up to 50,000 characters and the history only says they changed.
	 */
	private enum Field {
		TITLE("title", true, true), DESCRIPTION("description", true, false), TYPE("type", false, true),
		PRIORITY("priority", false, true), ASSIGNEE("assignee_id", false, true), STATUS("status_id", false, true);

		private final String column;
		private final boolean versioned;
		private final boolean keepsValues;

		Field(String column, boolean versioned, boolean keepsValues) {
			this.column = column;
			this.versioned = versioned;
			this.keepsValues = keepsValues;
		}

		/** The name in history, events and the API: {@code title}, {@code assignee}, {@code status}. */
		String label() {
			return name().toLowerCase(java.util.Locale.ROOT);
		}

		String column() {
			return column;
		}

		boolean versioned() {
			return versioned;
		}

		boolean keepsValues() {
			return keepsValues;
		}
	}

	private record HistoryRow(UUID id, UUID actorId, Instant at, String field, String before, String after) {
	}

	/** {@code statusId} null starts the Issue in the project's first To do Status. */
	record NewIssue(String type, String title, String description, String priority, UUID assigneeId,
			UUID statusId) {
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
