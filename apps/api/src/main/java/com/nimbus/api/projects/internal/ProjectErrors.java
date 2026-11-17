package com.nimbus.api.projects.internal;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
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
	ProblemDetail invalidFields(ProjectService.InvalidFields e) {
		return invalid(HttpStatus.BAD_REQUEST, e.getMessage(), e.errors);
	}

	@ExceptionHandler
	ProblemDetail archived(ProjectService.ProjectArchived e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail memberRefused(ProjectService.MemberRefused e) {
		return e.errors == null ? ProblemDetail.forStatusAndDetail(e.status, e.getMessage())
				: invalid(e.status, e.getMessage(), e.errors);
	}

	@ExceptionHandler
	ProblemDetail unreadableBody(HttpMessageNotReadableException e) {
		return invalid(HttpStatus.BAD_REQUEST, "Some fields are invalid", Map.of("body", "Send a valid JSON body"));
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

	private static ProblemDetail invalid(org.springframework.http.HttpStatusCode status, String detail, Map<String, String> errors) {
		var problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty("errors", errors);
		return problem;
	}
}
