package com.nimbus.api.identity.internal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
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

@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final Registration registration;

	private final AccessTokens accessTokens;

	AuthController(Registration registration, AccessTokens accessTokens) {
		this.registration = registration;
		this.accessTokens = accessTokens;
	}

	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	AuthResponse register(@Valid @RequestBody RegisterRequest request) {
		var user = registration.register(request.displayName(), request.email(), request.password());
		return new AuthResponse(accessTokens.issueFor(user), UserResponse.from(user));
	}

	/** Surrounding whitespace is dropped before validation; passwords are kept exactly as typed. */
	record RegisterRequest(
			@NotBlank @Size(max = 100)
			@Pattern(regexp = "\\P{Cntrl}*", message = "must not contain control characters") String displayName,
			@NotBlank @Email @Size(max = 254) String email,
			@NotNull @Size(min = 8, max = 128) String password) {

		RegisterRequest {
			displayName = displayName == null ? null : displayName.strip();
			email = email == null ? null : email.strip();
		}

	}

	record AuthResponse(String accessToken, UserResponse user) {
	}

}
