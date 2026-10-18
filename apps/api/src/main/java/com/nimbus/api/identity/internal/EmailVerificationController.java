package com.nimbus.api.identity.internal;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/verify-email")
class EmailVerificationController {

	private final EmailVerification verification;

	private final CurrentUser currentUser;

	EmailVerificationController(EmailVerification verification, CurrentUser currentUser) {
		this.verification = verification;
		this.currentUser = currentUser;
	}

	/** Checks the code the signed-in User typed; the same session carries on, now verified. */
	@PostMapping
	UserResponse verify(@Valid @RequestBody VerifyRequest request) {
		return UserResponse.from(verification.verify(currentUser.id(), request.code()));
	}

	/** Spaces are dropped, so a code pasted with a space in it still works. */
	record VerifyRequest(
			@NotNull(message = "Enter the 6-digit code") @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code") String code) {

		VerifyRequest {
			code = code == null ? null : code.replaceAll("\\s+", "");
		}

	}

}
