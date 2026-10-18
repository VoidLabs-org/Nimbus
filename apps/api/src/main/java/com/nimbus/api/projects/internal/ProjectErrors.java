package com.nimbus.api.projects.internal;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackageClasses = ProjectErrors.class)
class ProjectErrors {

	@ExceptionHandler
	ProblemDetail keyTaken(ProjectService.KeyTaken e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("errors", java.util.Map.of("key", e.getMessage()));
		return problem;
	}

	@ExceptionHandler
	ProblemDetail invalid(ProjectService.InvalidProject e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("errors", e.errors);
		return problem;
	}

	@ExceptionHandler
	ProblemDetail notFound(ProjectService.ProjectNotFound e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}
}
