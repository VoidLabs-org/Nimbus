package com.nimbus.api.issues.internal;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.nimbus.api.identity.CurrentUser;
import com.nimbus.api.issues.ProjectStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class IssuesController {

	private final IssueService issues;
	private final StatusService statuses;
	private final CurrentUser currentUser;

	IssuesController(IssueService issues, StatusService statuses, CurrentUser currentUser) {
		this.issues = issues;
		this.statuses = statuses;
		this.currentUser = currentUser;
	}

	@PostMapping("/api/projects/{key}/issues")
	@ResponseStatus(HttpStatus.CREATED)
	IssueService.IssueView create(@PathVariable String key, @Valid @RequestBody CreateIssue request) {
		return issues.create(currentUser.id(), key,
				new IssueService.NewIssue(request.type(), request.title(), request.description(),
						request.priority() == null ? "Medium" : request.priority(), request.assigneeId(),
						request.statusId()));
	}

	/** Invalid filters are refused with {@code 400} and {@code errors} keyed by parameter, like invalid fields. */
	@GetMapping("/api/projects/{key}/issues")
	IssueService.IssuePageView find(@PathVariable String key, @RequestParam(required = false) String status,
			@RequestParam(required = false) String category, @RequestParam(required = false) String type,
			@RequestParam(required = false) String priority, @RequestParam(required = false) String assignee,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "updated") String sort,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		Map<String, String> errors = new TreeMap<>();
		if (!Set.of("updated", "created", "priority", "rank").contains(sort)) {
			errors.put("sort", "Choose updated, created, priority or rank");
		}
		if (page < 0) errors.put("page", "Use 0 or more");
		if (size < 1 || size > 100) errors.put("size", "Use 1 to 100");
		var filter = filter(status, category, type, priority, assignee, q, sort, page, size, errors);
		return issues.find(currentUser.id(), key, filter);
	}

	/**
	 * How many Issues match the filters (the same as {@link #find}'s), and per value of Status, category, type and
	 * priority, for the Filter menu.
	 */
	@GetMapping("/api/projects/{key}/issues/counts")
	IssueService.IssueCountsView counts(@PathVariable String key, @RequestParam(required = false) String status,
			@RequestParam(required = false) String category, @RequestParam(required = false) String type,
			@RequestParam(required = false) String priority, @RequestParam(required = false) String assignee,
			@RequestParam(required = false) String q) {
		var filter = filter(status, category, type, priority, assignee, q, "updated", 0, 1, new TreeMap<>());
		return issues.counts(currentUser.id(), key, filter);
	}

	/** Every project the User is a Member of, with its Issue totals, for the Projects table: one request for all. */
	@GetMapping("/api/issues/stats")
	List<IssueService.ProjectStatsView> stats() {
		return issues.projectStats(currentUser.id());
	}

	/** The filters both endpoints take, checked; {@code errors} may already hold the caller's own. */
	private IssueService.IssueFilter filter(String status, String category, String type, String priority,
			String assignee, String q, String sort, int page, int size, Map<String, String> errors) {
		var me = currentUser.id();
		if (category != null && !Set.of("TODO", "IN_PROGRESS", "DONE").contains(category)) {
			errors.put("category", "Choose TODO, IN_PROGRESS or DONE");
		}
		if (type != null && !Set.of("Story", "Bug", "Chore").contains(type)) errors.put("type", CreateIssue.TYPE_RULE);
		if (priority != null && !Set.of("Urgent", "High", "Medium", "Low").contains(priority)) {
			errors.put("priority", CreateIssue.PRIORITY_RULE);
		}
		UUID assigneeId = null;
		if (assignee != null && assignee.equals("me")) assigneeId = me;
		else if (assignee != null && !assignee.equals("none")) {
			try {
				assigneeId = UUID.fromString(assignee);
			}
			catch (IllegalArgumentException e) {
				errors.put("assignee", "Use a User id, me or none");
			}
		}
		// Status names are the project's own, so any name is allowed; only its length is bounded, like the column.
		if (status != null && status.length() > 255) errors.put("status", "Use at most 255 characters");
		List<String> words = List.of();
		if (q != null && q.length() > 200) errors.put("q", "Use at most 10 words and 200 characters");
		else if (q != null) {
			words = Arrays.stream(q.strip().split("\\s+")).filter(w -> !w.isEmpty()).toList();
			if (words.size() > 10) errors.put("q", "Use at most 10 words and 200 characters");
		}
		if (!errors.isEmpty()) throw new IssueService.InvalidFields(errors);
		return new IssueService.IssueFilter(status, category, type, priority, assigneeId, "none".equals(assignee), words,
				sort, page, size);
	}

	@GetMapping("/api/issues/{issueKey}")
	IssueService.IssueView open(@PathVariable String issueKey) {
		return issues.open(currentUser.id(), issueKey);
	}

	/** Only the fields sent change; an empty {@code description} clears it. Title and description need {@code version}. */
	@PatchMapping("/api/issues/{issueKey}")
	IssueService.IssueView edit(@PathVariable String issueKey, @Valid @RequestBody EditIssue request) {
		return issues.edit(currentUser.id(), issueKey, new IssueService.IssueEdit(request.title(), request.description(),
				request.type(), request.priority(), request.version()));
	}

	@DeleteMapping("/api/issues/{issueKey}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable String issueKey) {
		issues.delete(currentUser.id(), issueKey);
	}

	/** {@code {"userId": null}} unassigns. */
	@PutMapping("/api/issues/{issueKey}/assignee")
	IssueService.IssueView assign(@PathVariable String issueKey, @RequestBody AssignIssue request) {
		return issues.assign(currentUser.id(), issueKey, request.userId());
	}

	/** Any Status of the Issue's project; no version needed. */
	@PutMapping("/api/issues/{issueKey}/status")
	IssueService.IssueView move(@PathVariable String issueKey, @RequestBody MoveIssue request) {
		return issues.move(currentUser.id(), issueKey, request.statusId());
	}

	/**
	 * Drops the Issue where the client saw it land: in {@code statusId} when the drop changes the Status, and directly
	 * after {@code after}, else directly before {@code before} (Issue keys of its neighbours there), else nowhere new.
	 * Best effort; see {@link IssueService#reorder}.
	 */
	@PutMapping("/api/issues/{issueKey}/rank")
	IssueService.IssueView reorder(@PathVariable String issueKey, @RequestBody RankIssue request) {
		return issues.reorder(currentUser.id(), issueKey, request.statusId(), request.after(), request.before(),
				Boolean.TRUE.equals(request.anyStatus()));
	}

	@GetMapping("/api/projects/{key}/statuses")
	List<ProjectStatus> statuses(@PathVariable String key) {
		return issues.statuses(currentUser.id(), key);
	}

	@PostMapping("/api/projects/{key}/statuses")
	@ResponseStatus(HttpStatus.CREATED)
	ProjectStatus addStatus(@PathVariable String key, @Valid @RequestBody AddStatus request) {
		return statuses.add(currentUser.id(), key, request.name(), request.category());
	}

	@PatchMapping("/api/projects/{key}/statuses/{statusId}")
	ProjectStatus editStatus(@PathVariable String key, @PathVariable UUID statusId,
			@Valid @RequestBody EditStatus request) {
		return statuses.edit(currentUser.id(), key, statusId, request.name(), request.category());
	}

	/** Makes a To do Status the one new Issues start in. */
	@PutMapping("/api/projects/{key}/statuses/{statusId}/default")
	ProjectStatus makeDefaultStatus(@PathVariable String key, @PathVariable UUID statusId) {
		return statuses.makeDefault(currentUser.id(), key, statusId);
	}

	/** All of the project's Statuses, in the new order. */
	@PutMapping("/api/projects/{key}/statuses/order")
	List<ProjectStatus> reorderStatuses(@PathVariable String key, @RequestBody ReorderStatuses request) {
		List<UUID> ids = request.statusIds() == null ? null
				: request.statusIds().stream()
					.map(id -> parseUuid("statusIds", id, "Send each of the project's Statuses once")).toList();
		return statuses.reorder(currentUser.id(), key, ids);
	}

	/** {@code moveTo} is where the deleted Status's Issues go; it is required when it has any. */
	@DeleteMapping("/api/projects/{key}/statuses/{statusId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteStatus(@PathVariable String key, @PathVariable UUID statusId,
			@RequestParam(required = false) String moveTo) {
		UUID target = moveTo == null ? null : parseUuid("moveTo", moveTo, "Choose another Status of the project");
		statuses.delete(currentUser.id(), key, statusId, target);
	}

	/** Strict: a UUID in its canonical 36-character form, or the field is invalid. */
	private static UUID parseUuid(String field, String value, String message) {
		if (value == null || !UUID_FORM.matcher(value).matches()) {
			throw new IssueService.InvalidField(field, message);
		}
		return UUID.fromString(value);
	}

	@GetMapping("/api/issues/{issueKey}/history")
	List<IssueService.HistoryEntryView> history(@PathVariable String issueKey) {
		return issues.history(currentUser.id(), issueKey);
	}

	record EditIssue(
			@Pattern(regexp = "Story|Bug|Chore", message = CreateIssue.TYPE_RULE) String type,
			@Pattern(regexp = "\\P{Cc}{1,255}", message = CreateIssue.TITLE_RULE) String title,
			@Size(max = 50_000, message = "Use at most 50,000 characters") String description,
			@Pattern(regexp = "Urgent|High|Medium|Low", message = CreateIssue.PRIORITY_RULE) String priority,
			Long version) {

		EditIssue {
			title = title == null ? null : title.strip();
		}
	}

	private static final java.util.regex.Pattern UUID_FORM = java.util.regex.Pattern
		.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
	static final String NAME_RULE = "Use 1 to 30 characters without control characters";
	static final String CATEGORY_RULE = "Choose TODO, IN_PROGRESS or DONE";

	/** The name is trimmed before it is checked, like an Issue's title. */
	record AddStatus(
			@NotNull(message = NAME_RULE) @Pattern(regexp = "\\P{Cc}{1,30}", message = NAME_RULE) String name,
			@NotNull(message = CATEGORY_RULE) @Pattern(regexp = "TODO|IN_PROGRESS|DONE", message = CATEGORY_RULE) String category) {

		AddStatus {
			name = name == null ? null : name.strip();
		}
	}

	record EditStatus(@Pattern(regexp = "\\P{Cc}{1,30}", message = NAME_RULE) String name,
			@Pattern(regexp = "TODO|IN_PROGRESS|DONE", message = CATEGORY_RULE) String category) {

		EditStatus {
			name = name == null ? null : name.strip();
		}
	}

	record ReorderStatuses(List<String> statusIds) {
	}

	record AssignIssue(UUID userId) {
	}

	record MoveIssue(UUID statusId) {
	}

	/** {@code anyStatus}: the neighbours may be of any Status (the Table, whose rows are of every Status). */
	record RankIssue(UUID statusId, String after, String before, Boolean anyStatus) {
	}

	/** The title is trimmed before it is checked, so pasted surrounding whitespace is not an error. */
	record CreateIssue(
			@NotNull(message = TYPE_RULE) @Pattern(regexp = "Story|Bug|Chore", message = TYPE_RULE) String type,
			@NotNull(message = TITLE_RULE) @Pattern(regexp = "\\P{Cc}{1,255}", message = TITLE_RULE) String title,
			@Size(max = 50_000, message = "Use at most 50,000 characters") String description,
			@Pattern(regexp = "Urgent|High|Medium|Low", message = PRIORITY_RULE) String priority,
			UUID assigneeId, UUID statusId) {

		static final String TYPE_RULE = "Choose Story, Bug or Chore";
		static final String TITLE_RULE = "Use 1 to 255 characters without control characters";
		static final String PRIORITY_RULE = "Choose Urgent, High, Medium or Low";

		CreateIssue {
			title = title == null ? null : title.strip();
		}
	}
}
