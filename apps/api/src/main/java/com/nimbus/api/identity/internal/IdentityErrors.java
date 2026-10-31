package com.nimbus.api.identity.internal;

import java.util.Map;
import java.util.TreeMap;

import com.nimbus.api.storage.StorageException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/** Turns identity errors into RFC 9457 problem details. */
@RestControllerAdvice(basePackageClasses = IdentityErrors.class)
class IdentityErrors {

	private static final Logger log = LoggerFactory.getLogger(IdentityErrors.class);

	@ExceptionHandler
	ProblemDetail emailAlreadyRegistered(Registration.EmailAlreadyRegisteredException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail sameEmail(EmailChange.SameEmailException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "same_email");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail emailTaken(EmailChange.EmailTakenException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "email_taken");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail noPassword(ConfirmItsYou.NoPasswordException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "no_password");
		return problem;
	}

	/** Reported under {@code errors.password}, like a field that failed validation, so the form can show it. */
	@ExceptionHandler
	ProblemDetail wrongConfirmPassword(ConfirmItsYou.WrongPasswordException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Some fields are invalid");
		problem.setProperty("errors", Map.of("password", e.getMessage()));
		return problem;
	}

	@ExceptionHandler
	ProblemDetail fileTooLarge(ProfilePictures.FileTooLargeException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "file_too_large");
		return problem;
	}

	/** A file over the multipart ceiling, which only the identity upload endpoint can receive here. */
	@ExceptionHandler
	ProblemDetail uploadTooLarge(MaxUploadSizeExceededException e) {
		return fileTooLarge(new ProfilePictures.FileTooLargeException());
	}

	/** The bucket couldn't be reached: a picture can't be stored or loaded right now, but nothing is broken for good. */
	@ExceptionHandler
	ProblemDetail storageUnavailable(StorageException e) {
		log.warn("The object store failed", e);
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"Pictures can't be stored or loaded right now. Try again in a moment.");
	}

	@ExceptionHandler
	ProblemDetail sourceUnavailable(ProfilePictures.SourceUnavailableException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "source_unavailable");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail unsupportedType(PictureImages.UnsupportedTypeException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "unsupported_type");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail unreadableImage(PictureImages.UnreadableImageException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "unreadable_image");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail sessionNotFound(Sessions.SessionNotFoundException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail unknownProvider(LinkedIdentities.UnknownProviderException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail reauthRequired(Sessions.ReauthRequiredException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
		problem.setProperty("code", "reauth_required");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail alreadyConnected(LinkedIdentities.AlreadyConnectedException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "already_connected");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail lastSignInMethod(LinkedIdentities.LastSignInMethodException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "last_sign_in_method");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail twoStepAlreadyOn(TwoStep.AlreadyOnException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "already_on");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail twoStepNotOn(TwoStep.NotOnException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "not_on");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail twoStepSetupExpired(TwoStep.SetupExpiredException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
		problem.setProperty("code", "setup_expired");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail wrongSignInCode(TwoStep.WrongSignInCodeException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "invalid_code");
		if (e.triesLeft() != null) {
			problem.setProperty("triesLeft", e.triesLeft());
		}
		return problem;
	}

	@ExceptionHandler
	ResponseEntity<ProblemDetail> signInExpired(TwoStepSignIn.SignInExpiredException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, e.getMessage());
		problem.setProperty("code", "sign_in_expired");
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
			.header(HttpHeaders.SET_COOKIE, PendingSignIns.clearedCookie().toString())
			.body(problem);
	}

	@ExceptionHandler
	ProblemDetail appSignInFailed(AppSignIn.FailedException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", e.code());
		return problem;
	}

	@ExceptionHandler
	ProblemDetail alreadyVerified(EmailVerification.AlreadyVerifiedException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
	}

	@ExceptionHandler
	ProblemDetail wrongCode(EmailedCodes.WrongCodeException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "invalid_code");
		problem.setProperty("triesLeft", e.triesLeft());
		return problem;
	}

	@ExceptionHandler
	ProblemDetail twoStepRequired(SecondCodes.TwoStepRequiredException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "two_step_required");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail wrongTwoStepCode(SecondCodes.WrongTwoStepCodeException e) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
		problem.setProperty("code", "invalid_two_step_code");
		return problem;
	}

	@ExceptionHandler
	ProblemDetail codeExpired(EmailedCodes.CodeExpiredException e) {
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
