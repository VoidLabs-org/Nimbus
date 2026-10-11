package com.nimbus.api.identity.internal;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
class UsersController {

	private final UserRepository users;

	private final CurrentUser currentUser;

	UsersController(UserRepository users, CurrentUser currentUser) {
		this.users = users;
		this.currentUser = currentUser;
	}

	/** The signed-in User's profile; an invalid-token 401 if their token outlived the User. */
	@GetMapping("/me")
	UserResponse me() {
		return users.findById(currentUser.id())
			.map(UserResponse::from)
			.orElseThrow(() -> new InvalidBearerTokenException("The User for this token no longer exists"));
	}

	/** Changes the display name only; email, password and avatar are not editable here. */
	@PatchMapping("/me")
	@Transactional
	UserResponse updateMe(@Valid @RequestBody UpdateProfileRequest request) {
		var user = users.findById(currentUser.id())
			.orElseThrow(() -> new InvalidBearerTokenException("The User for this token no longer exists"));
		user.rename(request.displayName());
		return UserResponse.from(user);
	}

	/** Same rules and trimming as the display name at registration. */
	record UpdateProfileRequest(
			@NotBlank @Size(max = 100)
			@Pattern(regexp = "\\P{Cntrl}*", message = "must not contain control characters") String displayName) {

		UpdateProfileRequest {
			displayName = displayName == null ? null : displayName.strip();
		}

	}

}
