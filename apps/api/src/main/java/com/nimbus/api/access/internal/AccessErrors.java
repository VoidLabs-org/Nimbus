package com.nimbus.api.access.internal;

import com.nimbus.api.access.PermissionDeniedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns access errors into RFC 9457 problem details. A missing Permission is answered the same way wherever it is
 * raised, so every module's controllers are covered.
 */
@RestControllerAdvice
class AccessErrors {

	@ExceptionHandler
	ProblemDetail permissionDenied(PermissionDeniedException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail roleNotFound(Roles.RoleNotFoundException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

}
