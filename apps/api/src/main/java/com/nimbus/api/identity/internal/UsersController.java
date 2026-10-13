package com.nimbus.api.identity.internal;

import java.util.UUID;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
class UsersController {

	private final UserRepository users;

	private final CurrentUser currentUser;

	private final Passwords passwords;

	UsersController(UserRepository users, CurrentUser currentUser, Passwords passwords) {
		this.users = users;
		this.currentUser = currentUser;
		this.passwords = passwords;
	}

	/** The signed-in User's profile; an invalid-token 401 if their token outlived the User. */
	@GetMapping("/me")
	UserResponse me() {
		return UserResponse.from(users.require(currentUser.id()));
	}

	/** Changes the display name only; email, password and avatar are not editable here. */
	@PatchMapping("/me")
	@Transactional
	UserResponse updateMe(@Valid @RequestBody UpdateProfileRequest request) {
		var user = users.require(currentUser.id());
		user.rename(request.displayName());
		return UserResponse.from(user);
	}

	/** Sets the first password of a User who has none, or changes the existing one (which must be given). */
	@PutMapping("/me/password")
	ResponseEntity<Void> changePassword(@AuthenticationPrincipal Jwt token,
			@Valid @RequestBody ChangePasswordRequest request) {
		var sessionId = token.getClaimAsString(AccessTokens.SESSION_CLAIM);
		if (sessionId == null) {
			throw new InvalidBearerTokenException("This token belongs to no session. Sign in again.");
		}
		passwords.change(currentUser.id(), UUID.fromString(sessionId), request.currentPassword(),
				request.newPassword());
		return ResponseEntity.noContent().build();
	}

	/** Same length rules as registration; passwords are kept exactly as typed. */
	record ChangePasswordRequest(
			@Size(max = 128) String currentPassword,
			@NotNull @Size(min = 8, max = 128) String newPassword) {
	}

	/** The same display name rule as at registration. */
	record UpdateProfileRequest(@ValidDisplayName String displayName) {

		UpdateProfileRequest {
			displayName = DisplayName.normalize(displayName);
		}

	}

}
