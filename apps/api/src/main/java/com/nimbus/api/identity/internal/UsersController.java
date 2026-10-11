package com.nimbus.api.identity.internal;

import com.nimbus.api.identity.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
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

	/** The signed-in User's profile; 401 if their token outlived the User. */
	@GetMapping("/me")
	ResponseEntity<UserResponse> me() {
		return users.findById(currentUser.id())
			.map(UserResponse::from)
			.map(ResponseEntity::ok)
			.orElseGet(() -> ResponseEntity.status(401).build());
	}

}
