package com.nimbus.api.identity.internal;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Turns identity errors into RFC 9457 problem details. */
@RestControllerAdvice(basePackageClasses = IdentityErrors.class)
class IdentityErrors {

	@ExceptionHandler
	ProblemDetail emailAlreadyRegistered(Registration.EmailAlreadyRegisteredException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
	}

	/** Lists each invalid field with its message under {@code errors}, so forms can show them. */
	@ExceptionHandler
	ProblemDetail invalidRequest(MethodArgumentNotValidException e) {
		Map<String, String> errors = new TreeMap<>();
		e.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Some fields are invalid");
		problem.setProperty("errors", errors);
		return problem;
	}

}
