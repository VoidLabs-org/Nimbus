package com.nimbus.api.identity.internal;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
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

	@ExceptionHandler
	ProblemDetail alreadyVerified(EmailVerification.AlreadyVerifiedException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail wrongCode(EmailVerification.WrongCodeException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "invalid_code");
		problem.setProperty("triesLeft", e.triesLeft());
		return problem;
	}

	@ExceptionHandler
	ProblemDetail codeExpired(EmailVerification.CodeExpiredException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "code_expired");
		return problem;
	}

	@ExceptionHandler
	ResponseEntity<ProblemDetail> limitExceeded(SlidingWindowLimiter.LimitExceededException e) {
		var seconds = Math.max(1, (e.retryAfter().toMillis() + 999) / 1000);
		return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
			.header(HttpHeaders.RETRY_AFTER, Long.toString(seconds))
			.body(ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, e.getMessage()));
	}

	@ExceptionHandler
	ProblemDetail invalidCredentials(SignIn.InvalidCredentialsException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, e.getMessage());
	}

	/** Reported under {@code errors.currentPassword}, like a field that failed validation, so forms can show it. */
	@ExceptionHandler
	ProblemDetail wrongPassword(Passwords.WrongPasswordException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Some fields are invalid");
		problem.setProperty("errors", Map.of("currentPassword", e.getMessage()));
		return problem;
	}

	@ExceptionHandler
	ProblemDetail notFromApp(AuthController.NotFromAppException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
	}

	@ExceptionHandler
	ResponseEntity<ProblemDetail> invalidRefreshToken(Sessions.InvalidRefreshTokenException e) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
			.header(HttpHeaders.SET_COOKIE, AuthController.clearedRefreshCookie().toString())
			.body(ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, e.getMessage()));
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
