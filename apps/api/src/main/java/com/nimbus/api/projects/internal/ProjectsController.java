package com.nimbus.api.projects.internal;

import java.util.List;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects")
class ProjectsController {

	private final ProjectService projects;
	private final CurrentUser currentUser;

	ProjectsController(ProjectService projects, CurrentUser currentUser) {
		this.projects = projects;
		this.currentUser = currentUser;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	ProjectService.ProjectView create(@Valid @RequestBody CreateProject request) {
		return projects.create(currentUser.id(), request.key(), request.name(), request.description());
	}

	@GetMapping
	List<ProjectService.ProjectView> list() {
		return projects.listFor(currentUser.id());
	}

	@GetMapping("/{key}")
	ProjectService.ProjectView open(@PathVariable String key) {
		return projects.open(currentUser.id(), key);
	}

	/**
	 * The name is cleaned at both ends before it is checked, so pasted surrounding whitespace is not an error, and
	 * neither are the invisible characters that look like it (non-breaking and other Unicode spaces, zero-width
	 * characters). A name of only those is empty. Patterns count Unicode code points; {@code \p{Cc}} is every control
	 * character. A description keeps line breaks and tabs.
	 */
	record CreateProject(
			@NotNull(message = KEY_RULE) @Pattern(regexp = ProjectKeys.PATTERN, message = KEY_RULE) String key,
			@NotNull(message = NAME_RULE) @Pattern(regexp = "\\P{Cc}{1,100}", message = NAME_RULE) String name,
			@Pattern(regexp = "(?:\\P{Cc}|[\\t\\n\\r]){0,1000}",
					message = "Use at most 1000 characters without control characters") String description) {

		static final String KEY_RULE = "Use 2 to 10 letters or digits, starting with a letter";
		static final String NAME_RULE = "Use 1 to 100 characters without control characters";

		/** Whitespace, Unicode spaces and separators (Z) and invisible format characters (Cf) at either end. */
		private static final java.util.regex.Pattern EDGES = java.util.regex.Pattern
			.compile("\\A[\\s\\p{Z}\\p{Cf}]+|[\\s\\p{Z}\\p{Cf}]+\\z");

		CreateProject {
			name = name == null ? null : EDGES.matcher(name).replaceAll("");
		}
	}
}
