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
	private final CurrentUser currentUser;

	IssuesController(IssueService issues, CurrentUser currentUser) {
		this.issues = issues;
		this.currentUser = currentUser;
	}

	@PostMapping("/api/projects/{key}/issues")
	@ResponseStatus(HttpStatus.CREATED)
	IssueService.IssueView create(@PathVariable String key, @Valid @RequestBody CreateIssue request) {
		return issues.create(currentUser.id(), key,
				new IssueService.NewIssue(request.type(), request.title(), request.description(),
						request.priority() == null ? "Medium" : request.priority(), request.assigneeId()));
	}

	/** Invalid filters are refused with {@code 400} and {@code errors} keyed by parameter, like invalid fields. */
	@GetMapping("/api/projects/{key}/issues")
	IssueService.IssuePageView find(@PathVariable String key, @RequestParam(required = false) String status,
			@RequestParam(required = false) String category, @RequestParam(required = false) String type,
			@RequestParam(required = false) String priority, @RequestParam(required = false) String assignee,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "updated") String sort,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var me = currentUser.id();
		Map<String, String> errors = new TreeMap<>();
		if (category != null && !Set.of("TODO", "IN_PROGRESS", "DONE").contains(category)) {
			errors.put("category", "Choose TODO, IN_PROGRESS or DONE");
		}
		if (type != null && !Set.of("Story", "Bug", "Chore").contains(type)) errors.put("type", CreateIssue.TYPE_RULE);
		if (priority != null && !Set.of("Urgent", "High", "Medium", "Low").contains(priority)) {
			errors.put("priority", CreateIssue.PRIORITY_RULE);
		}
		if (!Set.of("updated", "created", "priority").contains(sort)) errors.put("sort", "Choose updated, created or priority");
		if (page < 0) errors.put("page", "Use 0 or more");
		if (size < 1 || size > 100) errors.put("size", "Use 1 to 100");
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

		return issues.find(me, key, new IssueService.IssueFilter(status, category, type, priority, assigneeId,
				"none".equals(assignee), words, sort, page, size));
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

	@GetMapping("/api/projects/{key}/statuses")
	List<ProjectStatus> statuses(@PathVariable String key) {
		return issues.statuses(currentUser.id(), key);
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

	record AssignIssue(UUID userId) {
	}

	record MoveIssue(UUID statusId) {
	}

	/** The title is trimmed before it is checked, so pasted surrounding whitespace is not an error. */
	record CreateIssue(
			@NotNull(message = TYPE_RULE) @Pattern(regexp = "Story|Bug|Chore", message = TYPE_RULE) String type,
			@NotNull(message = TITLE_RULE) @Pattern(regexp = "\\P{Cc}{1,255}", message = TITLE_RULE) String title,
			@Size(max = 50_000, message = "Use at most 50,000 characters") String description,
			@Pattern(regexp = "Urgent|High|Medium|Low", message = PRIORITY_RULE) String priority,
			UUID assigneeId) {

		static final String TYPE_RULE = "Choose Story, Bug or Chore";
		static final String TITLE_RULE = "Use 1 to 255 characters without control characters";
		static final String PRIORITY_RULE = "Choose Urgent, High, Medium or Low";

		CreateIssue {
			title = title == null ? null : title.strip();
		}
	}
}
