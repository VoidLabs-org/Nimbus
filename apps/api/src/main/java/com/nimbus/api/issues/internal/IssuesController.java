package com.nimbus.api.issues.internal;

import java.util.UUID;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

	@GetMapping("/api/issues/{issueKey}")
	IssueService.IssueView open(@PathVariable String issueKey) {
		return issues.open(currentUser.id(), issueKey);
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
