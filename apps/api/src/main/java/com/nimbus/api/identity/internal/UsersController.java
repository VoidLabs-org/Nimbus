package com.nimbus.api.identity.internal;

import java.util.List;
import java.util.UUID;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

	private final Sessions sessions;

	UsersController(UserRepository users, CurrentUser currentUser, Passwords passwords, Sessions sessions) {
		this.users = users;
		this.currentUser = currentUser;
		this.passwords = passwords;
		this.sessions = sessions;
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
		passwords.change(currentUser.id(), sessionOf(token), request.currentPassword(), request.newPassword());
		return ResponseEntity.noContent().build();
	}

	/** The User's running sessions, this browser's first. */
	@GetMapping("/me/sessions")
	List<Sessions.SessionView> sessions(@AuthenticationPrincipal Jwt token) {
		return sessions.listFor(currentUser.id(), sessionOf(token));
	}

	/** Ends one of the User's sessions, without asking for a password; a session that is already over also gives 204. */
	@DeleteMapping("/me/sessions/{id}")
	ResponseEntity<Void> endSession(@AuthenticationPrincipal Jwt token, @PathVariable UUID id) {
		sessions.endOne(currentUser.id(), sessionOf(token), id);
		return ResponseEntity.noContent().build();
	}

	private static UUID sessionOf(Jwt token) {
		var sessionId = token.getClaimAsString(AccessTokens.SESSION_CLAIM);
		if (sessionId == null) {
			throw new InvalidBearerTokenException("This token belongs to no session. Sign in again.");
		}
		try {
			return UUID.fromString(sessionId);
		}
		catch (IllegalArgumentException e) {
			throw new InvalidBearerTokenException("This token belongs to no session. Sign in again.");
		}
	}

	/** Same length rules as registration; passwords are kept exactly as typed. */
	record ChangePasswordRequest(
			@Size(max = ValidPassword.MAX_LENGTH) String currentPassword,
			@ValidPassword String newPassword) {
	}

	/** The same display name rule as at registration. */
	record UpdateProfileRequest(@ValidDisplayName String displayName) {

		UpdateProfileRequest {
			displayName = DisplayName.normalize(displayName);
		}

	}

}
