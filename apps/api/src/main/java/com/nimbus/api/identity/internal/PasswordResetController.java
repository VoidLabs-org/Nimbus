package com.nimbus.api.identity.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Forgot password, for visitors who are not signed in. */
@RestController
@RequestMapping("/api/auth/password-reset")
class PasswordResetController {

	private final PasswordReset passwordReset;

	PasswordResetController(PasswordReset passwordReset) {
		this.passwordReset = passwordReset;
	}

	/**
	 * {@code 204}, registered email or not; the Reset code is issued and mailed afterwards. {@code 429} with
	 * {@code Retry-After} when the IP address asked too often or the email was mailed too recently or too often,
	 * again whether or not it is registered.
	 */
	@PostMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void request(@Valid @RequestBody ResetRequest request, HttpServletRequest http) {
		passwordReset.request(request.email(), http.getRemoteAddr());
	}

	/**
	 * Sets the new password when the code is right; the User then signs in with it. A new password that breaks
	 * the rule is refused before the code is looked at, so it costs no try. {@code 429} with {@code Retry-After}
	 * when the IP address tried too often.
	 */
	@PostMapping("/confirm")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void confirm(@Valid @RequestBody ConfirmRequest request, HttpServletRequest http) {
		passwordReset.reset(request.email(), request.code(), request.newPassword(), request.twoStepCode(),
				request.recoveryCode(), http.getRemoteAddr());
	}

	/** Capped like sign-in, so oversized input never reaches the background work. */
	record ResetRequest(@NotBlank @Size(max = ValidEmail.MAX_LENGTH) String email) {

		ResetRequest {
			email = email == null ? null : email.strip();
		}

	}

	/**
	 * Spaces are dropped from the code, so one pasted with a space in it still works; the password is kept as typed.
	 * A User with Two-step verification also sends a Sign-in code ({@code twoStepCode}) or a Recovery code; anything
	 * that isn't one is simply a wrong code.
	 */
	record ConfirmRequest(
			@NotBlank @Size(max = ValidEmail.MAX_LENGTH) String email,
			@NotNull(message = "Enter the 6-digit code") @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code") String code,
			@ValidPassword String newPassword,
			@Size(max = 64) String twoStepCode,
			@Size(max = 64) String recoveryCode) {

		ConfirmRequest {
			email = email == null ? null : email.strip();
			code = code == null ? null : code.replaceAll("\\s+", "");
		}

	}

}
