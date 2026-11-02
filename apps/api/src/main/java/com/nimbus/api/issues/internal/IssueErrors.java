package com.nimbus.api.issues.internal;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Problem details for the issues module's endpoints, with invalid fields under {@code errors} like projects'. */
@RestControllerAdvice(basePackageClasses = IssueErrors.class)
class IssueErrors {

	@ExceptionHandler
	ProblemDetail notFound(IssueService.NotFound e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail conflict(IssueService.Conflict e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		if (e.code() != null) problem.setProperty("code", e.code());
		return problem;
	}

	@ExceptionHandler
	ProblemDetail invalidField(IssueService.InvalidField e) {
		return invalid(Map.of(e.field(), e.getMessage()));
	}

	@ExceptionHandler
	ProblemDetail invalidFields(IssueService.InvalidFields e) {
		return invalid(e.errors());
	}

	@ExceptionHandler
	ProblemDetail wrongType(MethodArgumentTypeMismatchException e) {
		return invalid(Map.of(e.getName(), "Use a whole number"));
	}

	@ExceptionHandler
	ProblemDetail invalidRequest(MethodArgumentNotValidException e) {
		Map<String, String> errors = new TreeMap<>();
		e.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		return invalid(errors);
	}

	@ExceptionHandler
	ProblemDetail unreadableBody(HttpMessageNotReadableException e) {
		return invalid(Map.of("body", "Send a valid JSON body"));
	}

	private static ProblemDetail invalid(Map<String, String> errors) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Some fields are invalid");
		problem.setProperty("errors", errors);
		return problem;
	}
}
