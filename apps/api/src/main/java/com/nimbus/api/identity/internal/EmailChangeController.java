package com.nimbus.api.identity.internal;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me/email-change")
class EmailChangeController {

	private final EmailChange emailChange;

	private final Sessions sessions;

	private final CurrentUser currentUser;

	private final ProfilePictures pictures;

	EmailChangeController(EmailChange emailChange, Sessions sessions, CurrentUser currentUser,
			ProfilePictures pictures) {
		this.pictures = pictures;
		this.emailChange = emailChange;
		this.sessions = sessions;
		this.currentUser = currentUser;
	}

	/** Mails a code to the new address, replacing any pending change; Resend is the same call. */
	@PostMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void request(@AuthenticationPrincipal Jwt token, @Valid @RequestBody ChangeRequest request) {
		emailChange.request(currentUser.id(), UsersController.sessionOf(token), request.email());
	}

	/** Changes the email when the code from the new inbox is right; the same session carries on. */
	@PostMapping("/confirm")
	UserResponse confirm(@AuthenticationPrincipal Jwt token, @Valid @RequestBody ConfirmRequest request) {
		sessions.requireActive(UsersController.sessionOf(token), currentUser.id());
		return UserResponse.from(emailChange.confirm(currentUser.id(), request.code()), pictures);
	}

	/** The same email rule as at registration. */
	record ChangeRequest(@ValidEmail String email) {

		ChangeRequest {
			email = email == null ? null : email.strip();
		}

	}

	/** Spaces are dropped, so a code pasted with a space in it still works. */
	record ConfirmRequest(
			@NotNull(message = "Enter the 6-digit code") @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code") String code) {

		ConfirmRequest {
			code = code == null ? null : code.replaceAll("\\s+", "");
		}

	}

}
