package com.nimbus.api.issues.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import com.nimbus.api.issues.IssueChanged;
import com.nimbus.api.issues.ProjectStatus;
import com.nimbus.api.projects.ProjectSummary;
import com.nimbus.api.projects.Projects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Adds, renames, reorders, re-categorises and deletes a project's Statuses. See {@code docs/specs/issues.md}.
 * Every change takes the project's {@code issue_counters} row lock (the one creating an Issue takes), so Status
 * changes queue up with each other and with creates, and the limit, the names and the positions can't race.
 */
@Service
@Transactional
class StatusService {

	static final int LIMIT = 20;

	private final JdbcClient jdbc;
	private final Projects projects;
	private final IssueAccess access;
	private final ApplicationEventPublisher events;
	private final Clock clock;

	StatusService(JdbcClient jdbc, Projects projects, IssueAccess access, ApplicationEventPublisher events,
			Clock clock) {
		this.jdbc = jdbc;
		this.projects = projects;
		this.access = access;
		this.events = events;
		this.clock = clock;
	}

	/** Goes after the last Status of its category. */
	ProjectStatus add(UUID actor, String projectKey, String name, String category) {
		var project = lock(actor, projectKey);
		var all = statuses(project.id());
		if (all.size() >= LIMIT) {
			throw new IssueService.Conflict("A project has at most " + LIMIT + " Statuses", "status_limit");
		}
		requireFreeName(all, name, null);
		var position = all.stream().filter(status -> status.category().equals(category))
			.mapToInt(ProjectStatus::position).max().orElse(all.size() - 1) + 1;
		jdbc.sql("UPDATE issue_statuses SET position = position + 1 WHERE project_id = :project AND position >= :position")
			.param("project", project.id()).param("position", position).update();
		var id = UUID.randomUUID();
		jdbc.sql("INSERT INTO issue_statuses (id, project_id, name, category, position) VALUES (:id, :project, :name, :category, :position)")
			.param("id", id).param("project", project.id()).param("name", name).param("category", category)
			.param("position", position).update();
		return new ProjectStatus(id, name, category, position);
	}

	/** Only what is sent changes; the id stays, so Issues keep their Status. */
	ProjectStatus edit(UUID actor, String projectKey, UUID statusId, String name, String category) {
		var project = lock(actor, projectKey);
		var all = statuses(project.id());
		var current = find(all, statusId);
		var newName = name == null ? current.name() : name;
		var newCategory = category == null ? current.category() : category;
		if (!newName.equals(current.name())) requireFreeName(all, newName, statusId);
		if (!newCategory.equals(current.category())) requireOtherInCategory(all, current);
		jdbc.sql("UPDATE issue_statuses SET name = :name, category = :category WHERE id = :id")
			.param("name", newName).param("category", newCategory).param("id", statusId).update();
		return new ProjectStatus(statusId, newName, newCategory, current.position());
	}

	/** {@code statusIds} must be exactly the project's Statuses, each once. */
	List<ProjectStatus> reorder(UUID actor, String projectKey, List<UUID> statusIds) {
		var project = lock(actor, projectKey);
		var all = statuses(project.id());
		var present = new HashSet<>(all.stream().map(ProjectStatus::id).toList());
		if (statusIds == null || statusIds.size() != all.size() || !new HashSet<>(statusIds).equals(present)) {
			throw new IssueService.InvalidField("statusIds", "Send each of the project's Statuses once");
		}
		for (int position = 0; position < statusIds.size(); position++) {
			jdbc.sql("UPDATE issue_statuses SET position = :position WHERE id = :id")
				.param("position", position).param("id", statusIds.get(position)).update();
		}
		return statuses(project.id());
	}

	/**
	 * Moves the Status's Issues to {@code moveTo} (required when it has any), one history entry and one
	 * {@link IssueChanged} each, then removes it.
	 */
	void delete(UUID actor, String projectKey, UUID statusId, UUID moveTo) {
		var project = lock(actor, projectKey);
		var all = statuses(project.id());
		var current = find(all, statusId);
		requireOtherInCategory(all, current);
		var target = moveTo == null ? null : all.stream().filter(status -> status.id().equals(moveTo)).findFirst()
			.filter(status -> !status.id().equals(statusId)).orElseThrow(
					() -> new IssueService.InvalidField("moveTo", "Choose another Status of the project"));
		var issues = jdbc.sql("SELECT id, number FROM issues WHERE status_id = :status ORDER BY number FOR UPDATE")
			.param("status", statusId)
			.query((row, index) -> new Moved(row.getObject("id", UUID.class), row.getInt("number"))).list();
		if (!issues.isEmpty() && target == null) {
			throw new IssueService.InvalidField("moveTo", "Choose where to move this Status's Issues");
		}
		var now = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS));
		var changed = new java.util.ArrayList<IssueChanged>();
		for (var issue : issues) {
			jdbc.sql("UPDATE issues SET status_id = :to, updated_at = :at WHERE id = :id")
				.param("to", target.id()).param("at", now).param("id", issue.id()).update();
			jdbc.sql("""
					INSERT INTO issue_history (id, issue_id, actor_id, at, field, before_value, after_value)
					VALUES (:id, :issue, :actor, :at, 'status', :before, :after)
					""")
				.param("id", UUID.randomUUID()).param("issue", issue.id()).param("actor", actor).param("at", now)
				.param("before", current.name()).param("after", target.name()).update();
			changed.add(new IssueChanged(project.id(), IssueKeys.format(project.key(), issue.number()),
					List.of("status")));
		}
		try {
			jdbc.sql("DELETE FROM issue_statuses WHERE id = :id").param("id", statusId).update();
		}
		catch (DataIntegrityViolationException e) {
			// An Issue was moved into this Status after the Issues above were read.
			throw new IssueService.Conflict("An Issue just moved into this Status, so try again", null);
		}
		jdbc.sql("UPDATE issue_statuses SET position = position - 1 WHERE project_id = :project AND position > :position")
			.param("project", project.id()).param("position", current.position()).update();
		// Only now that nothing can refuse the delete.
		changed.forEach(events::publishEvent);
	}

	/**
	 * The shared start of every change: the project is found and the actor allowed (unknown and non-Member are both
	 * "not found"), the counter row is locked, then Archived is read again under the lock and the default Statuses
	 * are made if the project has none.
	 */
	private ProjectSummary lock(UUID actor, String projectKey) {
		var project = projects.findByKey(projectKey).orElseThrow(() -> new IssueService.NotFound("Project not found"));
		access.require(actor, project.id(), IssueAccess.Action.MANAGE_STATUSES);
		jdbc.sql("INSERT INTO issue_counters (project_id, last_number) VALUES (:project, 0) ON CONFLICT DO NOTHING")
			.param("project", project.id()).update();
		jdbc.sql("SELECT last_number FROM issue_counters WHERE project_id = :project FOR UPDATE")
			.param("project", project.id()).query(Integer.class).single();
		var fresh = projects.findByKey(projectKey).orElseThrow(() -> new IssueService.NotFound("Project not found"));
		if (fresh.archived()) {
			throw new IssueService.Conflict("This project is archived, so its Statuses can't be changed", null);
		}
		DefaultStatuses.ensure(jdbc, project.id());
		return fresh;
	}

	private List<ProjectStatus> statuses(UUID projectId) {
		return jdbc.sql("SELECT id, name, category, position FROM issue_statuses WHERE project_id = :project ORDER BY position")
			.param("project", projectId)
			.query((row, index) -> new ProjectStatus(row.getObject("id", UUID.class), row.getString("name"),
					row.getString("category"), row.getInt("position")))
			.list();
	}

	private static ProjectStatus find(List<ProjectStatus> all, UUID statusId) {
		return all.stream().filter(status -> status.id().equals(statusId)).findFirst()
			.orElseThrow(() -> new IssueService.NotFound("Status not found"));
	}

	private static void requireFreeName(List<ProjectStatus> all, String name, UUID except) {
		if (all.stream().anyMatch(status -> !status.id().equals(except) && status.name().equalsIgnoreCase(name))) {
			throw new IssueService.Conflict("A Status named " + name + " already exists", "status_name_taken");
		}
	}

	/** A category can't be left without a Status. */
	private static void requireOtherInCategory(List<ProjectStatus> all, ProjectStatus leaving) {
		if (all.stream().noneMatch(
				status -> !status.id().equals(leaving.id()) && status.category().equals(leaving.category()))) {
			throw new IssueService.Conflict("A project keeps at least one Status in each category",
					"category_needs_status");
		}
	}

	private record Moved(UUID id, int number) {
	}
}
