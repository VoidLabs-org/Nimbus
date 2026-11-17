package com.nimbus.api.projects.internal;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.nimbus.api.access.Authorize;
import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
	@Authorize("projects:project:create")
	@ResponseStatus(HttpStatus.CREATED)
	ProjectService.ProjectView create(@Valid @RequestBody CreateProject request) {
		return projects.create(currentUser.id(), request.key(), request.name(), request.description());
	}

	@GetMapping
	List<ProjectService.ProjectView> list(@RequestParam(defaultValue = "false") boolean archived) {
		return archived ? projects.listArchivedFor(currentUser.id()) : projects.listFor(currentUser.id());
	}

	@PostMapping("/{key}/archive")
	ProjectService.ProjectView archive(@PathVariable String key) {
		return projects.archive(currentUser.id(), key);
	}

	@PostMapping("/{key}/restore")
	ProjectService.ProjectView restore(@PathVariable String key) {
		return projects.restore(currentUser.id(), key);
	}

	@GetMapping("/{key}/members")
	List<ProjectService.MemberView> members(@PathVariable String key) {
		return projects.members(currentUser.id(), key);
	}

	/** The project roles for the add and change controls; each says whether the User may give it. */
	@GetMapping("/{key}/member-roles")
	List<ProjectService.RoleOption> memberRoles(@PathVariable String key) {
		return projects.memberRoles(currentUser.id(), key);
	}

	@PostMapping("/{key}/members")
	@ResponseStatus(HttpStatus.CREATED)
	ProjectService.MemberView addMember(@PathVariable String key, @Valid @RequestBody AddMember request) {
		return projects.addMember(currentUser.id(), key, request.email(), request.role());
	}

	@PatchMapping("/{key}/members/{userId}")
	ProjectService.MemberView changeMember(@PathVariable String key, @PathVariable java.util.UUID userId,
			@Valid @RequestBody ChangeMember request) {
		return projects.changeMember(currentUser.id(), key, userId, request.role());
	}

	@DeleteMapping("/{key}/members/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeMember(@PathVariable String key, @PathVariable java.util.UUID userId) {
		projects.removeMember(currentUser.id(), key, userId);
	}

	record AddMember(@NotBlank(message = "Enter an email") String email,
			@NotBlank(message = "Choose a project role") String role) {
	}

	record ChangeMember(@NotBlank(message = "Choose a project role") String role) {
	}

	@GetMapping("/{key}")
	ProjectService.ProjectView open(@PathVariable String key) {
		return projects.open(currentUser.id(), key);
	}

	/**
	 * Only the fields sent change; {@code "description": null} clears it. The Project key can't be changed, so sending
	 * one is refused. {@link UpdateProject} remembers which fields were sent, because "not sent" and "null" differ
	 * for the description.
	 */
	@PatchMapping("/{key}")
	ProjectService.ProjectView edit(@PathVariable String key, @RequestBody UpdateProject body) {
		return projects.edit(currentUser.id(), key, body);
	}

	/** A change to a project: what was sent, as sent. Other unknown fields are ignored; {@code key} is refused. */
	static final class UpdateProject {
		private String name;
		private String description;
		private boolean nameSent;
		private boolean descriptionSent;
		private boolean keySent;

		@JsonSetter("name")
		void setName(String name) {
			this.name = name;
			this.nameSent = true;
		}

		@JsonSetter("description")
		void setDescription(String description) {
			this.description = description;
			this.descriptionSent = true;
		}

		@JsonSetter("key")
		void setKey(Object ignored) {
			this.keySent = true;
		}

		boolean nameSent() { return nameSent; }

		boolean descriptionSent() { return descriptionSent; }

		boolean keySent() { return keySent; }

		String name() { return name; }

		String description() { return description; }
	}

	/**
	 * The name and the description are cleaned at both ends before they are checked, so pasted surrounding whitespace
	 * is not an error, and neither are the invisible characters that look like it (non-breaking and other Unicode
	 * spaces, zero-width characters). A name of only those is empty; a description of only those is none. Patterns
	 * count Unicode code points; {@code \p{Cc}} is every control character. A description keeps line breaks and tabs
	 * inside it.
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

		/** The name and the description are cleaned at both ends; a description with nothing left is none. */
		CreateProject {
			name = cleanName(name);
			description = cleanDescription(description);
		}

		private static String clean(String text) {
			return EDGES.matcher(text).replaceAll("");
		}

		/** A name as the rules see it, for checking one field alone. */
		static String cleanName(String name) {
			return name == null ? null : clean(name);
		}

		/** A description as the rules see it: cleaned, and none when nothing is left. */
		static String cleanDescription(String description) {
			return description == null || clean(description).isEmpty() ? null : clean(description);
		}
	}
}
