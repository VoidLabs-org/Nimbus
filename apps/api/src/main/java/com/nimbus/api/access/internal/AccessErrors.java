package com.nimbus.api.access.internal;

import com.nimbus.api.access.PermissionDeniedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Answers a missing Permission with {@code 403} problem details wherever it is raised, so every module's controllers
 * are covered. The access module's own request errors are in {@link AccessRequestErrors}.
 */
@RestControllerAdvice
class AccessErrors {

	@ExceptionHandler
	ProblemDetail permissionDenied(PermissionDeniedException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
	}

}
