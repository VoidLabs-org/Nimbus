package com.nimbus.api.projects.internal;

import com.nimbus.api.identity.CurrentUser;
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
	ProjectService.ProjectView create(@RequestBody CreateProject request) {
		return projects.create(currentUser.id(), request.key(), request.name(), request.description());
	}

	@GetMapping("/{key}")
	ProjectService.ProjectView open(@PathVariable String key) {
		return projects.open(currentUser.id(), key);
	}

	record CreateProject(String key, String name, String description) {
	}
}
