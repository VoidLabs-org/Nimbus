package com.nimbus.api.access.internal;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

/**
 * Problem details for the access module's own endpoints, with invalid fields under {@code errors} like identity's,
 * so forms can show them. Scoped to this module, unlike {@link AccessErrors}, which answers a missing Permission
 * wherever it is raised.
 */
@RestControllerAdvice(basePackageClasses = AccessRequestErrors.class)
class AccessRequestErrors {

	@ExceptionHandler
	ProblemDetail roleNotFound(Roles.RoleNotFoundException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail userNotFound(PlatformRoleHolders.UserNotFoundException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail ownAssignment(PlatformRoleHolders.OwnAssignmentException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail conflict(RoleEditor.RoleConflictException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail invalidGrants(RoleEditor.InvalidGrantsException e) {
		return invalid(HttpStatus.BAD_REQUEST, e.getMessage(), e.errors());
	}

	@ExceptionHandler
	ProblemDetail keyTaken(RoleEditor.RoleKeyTakenException e) {
		return invalid(HttpStatus.CONFLICT, e.getMessage(), Map.of("key", e.getMessage()));
	}

	@ExceptionHandler
	ProblemDetail invalidRequest(MethodArgumentNotValidException e) {
		Map<String, String> errors = new TreeMap<>();
		e.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		return invalid(HttpStatus.BAD_REQUEST, "Some fields are invalid", errors);
	}

	@ExceptionHandler
	ProblemDetail invalidParameters(HandlerMethodValidationException e) {
		Map<String, String> errors = new TreeMap<>();
		e.getParameterValidationResults().forEach(result -> result.getResolvableErrors()
			.forEach(error -> errors.putIfAbsent(result.getMethodParameter().getParameterName(),
					error.getDefaultMessage())));
		return invalid(HttpStatus.BAD_REQUEST, "Some parameters are invalid", errors);
	}

	static ProblemDetail invalid(HttpStatus status, String detail, Map<String, String> errors) {
		var problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty("errors", errors);
		return problem;
	}

}
