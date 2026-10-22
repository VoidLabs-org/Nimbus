package com.nimbus.api.projects.internal;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Problem details for the projects module's endpoints, with invalid fields under {@code errors} like access's. */
@RestControllerAdvice(basePackageClasses = ProjectErrors.class)
class ProjectErrors {

	@ExceptionHandler
	ProblemDetail keyTaken(ProjectService.KeyTaken e) {
		return invalid(HttpStatus.CONFLICT, e.getMessage(), Map.of("key", e.getMessage()));
	}

	@ExceptionHandler
	ProblemDetail invalidRequest(MethodArgumentNotValidException e) {
		Map<String, String> errors = new TreeMap<>();
		e.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		return invalid(HttpStatus.BAD_REQUEST, "Some fields are invalid", errors);
	}

	@ExceptionHandler
	ProblemDetail notFound(ProjectService.ProjectNotFound e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

	private static ProblemDetail invalid(HttpStatus status, String detail, Map<String, String> errors) {
		var problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty("errors", errors);
		return problem;
	}
}
