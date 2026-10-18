package com.nimbus.api.identity.internal;

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

	/** Always {@code 204}, registered email or not; the Reset code is issued and mailed afterwards. */
	@PostMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void request(@Valid @RequestBody ResetRequest request) {
		passwordReset.request(request.email());
	}

	/**
	 * Sets the new password when the code is right; the User then signs in with it. A new password that breaks
	 * the rule is refused before the code is looked at, so it costs no try.
	 */
	@PostMapping("/confirm")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void confirm(@Valid @RequestBody ConfirmRequest request) {
		passwordReset.reset(request.email(), request.code(), request.newPassword());
	}

	/** Capped like sign-in, so oversized input never reaches the background work. */
	record ResetRequest(@NotBlank @Size(max = ValidEmail.MAX_LENGTH) String email) {

		ResetRequest {
			email = email == null ? null : email.strip();
		}

	}

	/** Spaces are dropped from the code, so one pasted with a space in it still works; the password is kept as typed. */
	record ConfirmRequest(
			@NotBlank @Size(max = ValidEmail.MAX_LENGTH) String email,
			@NotNull(message = "Enter the 6-digit code") @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code") String code,
			@ValidPassword String newPassword) {

		ConfirmRequest {
			email = email == null ? null : email.strip();
			code = code == null ? null : code.replaceAll("\\s+", "");
		}

	}

}
