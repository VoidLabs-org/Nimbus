package com.nimbus.api.identity.internal;

import java.time.Duration;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

	/** Sent only to /api/auth and never readable by page scripts. */
	static final String REFRESH_COOKIE = "refresh_token";

	private final Registration registration;

	private final SignIn signIn;

	private final AccessTokens accessTokens;

	private final Sessions sessions;

	AuthController(Registration registration, SignIn signIn, AccessTokens accessTokens, Sessions sessions) {
		this.registration = registration;
		this.signIn = signIn;
		this.accessTokens = accessTokens;
		this.sessions = sessions;
	}

	@PostMapping("/register")
	ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
		var user = registration.register(request.displayName(), request.email(), request.password(),
				http.getRemoteAddr());
		return signedIn(HttpStatus.CREATED, user);
	}

	@PostMapping("/login")
	ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
		var user = signIn.signIn(request.email(), request.password(), http.getRemoteAddr());
		return signedIn(HttpStatus.OK, user);
	}

	/**
	 * Exchanges the refresh cookie for a new one and a fresh access token. The cookie is the only credential, so
	 * the request must also carry a header that cross-site forms can't set.
	 */
	@PostMapping("/refresh")
	ResponseEntity<AuthResponse> refresh(@CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken,
			@RequestHeader(name = "X-Requested-With", required = false) String requestedWith,
			HttpServletRequest http) {
		requireNimbusHeader(requestedWith);
		var refreshed = sessions.refresh(refreshToken, http.getRemoteAddr());
		return withSession(HttpStatus.OK, refreshed.user(), refreshed.token());
	}

	/**
	 * Ends this browser's session only and clears its cookie. Like {@code /refresh} the cookie is the only
	 * credential, so it needs the same header. Succeeds even if there was no session left to end.
	 */
	@PostMapping("/logout")
	ResponseEntity<Void> logout(@CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken,
			@RequestHeader(name = "X-Requested-With", required = false) String requestedWith) {
		requireNimbusHeader(requestedWith);
		sessions.end(refreshToken);
		return ResponseEntity.noContent()
			.header(HttpHeaders.SET_COOKIE, clearedRefreshCookie().toString())
			.build();
	}

	/**
	 * Endpoints that the refresh cookie alone authenticates must come from the Nimbus app: cross-site forms
	 * can't set this header. Call it first in every such endpoint. When a third one appears, move the check
	 * into a filter for those routes.
	 */
	private static void requireNimbusHeader(String requestedWith) {
		if (!"nimbus".equals(requestedWith)) {
			throw new NotFromAppException();
		}
	}

	/** Starts a session: the access token goes in the body, the refresh token only in the cookie. */
	private ResponseEntity<AuthResponse> signedIn(HttpStatus status, User user) {
		return withSession(status, user, sessions.start(user));
	}

	private ResponseEntity<AuthResponse> withSession(HttpStatus status, User user, Sessions.IssuedToken refreshToken) {
		return ResponseEntity.status(status)
			.header(HttpHeaders.SET_COOKIE, refreshCookie(refreshToken.value(), refreshToken.lifetime()).toString())
			.body(new AuthResponse(accessTokens.issueFor(user), UserResponse.from(user)));
	}

	/** Tells the browser to drop a refresh token the server rejected, instead of resending it on every load. */
	static ResponseCookie clearedRefreshCookie() {
		return refreshCookie("", Duration.ZERO);
	}

	static ResponseCookie refreshCookie(String value, Duration maxAge) {
		return ResponseCookie.from(REFRESH_COOKIE, value)
			.httpOnly(true)
			.secure(true)
			.sameSite("Strict")
			.path("/api/auth")
			.maxAge(maxAge)
			.build();
	}

	/** Capped like registration, so oversized input never reaches the limiter or the password hash. */
	record LoginRequest(
			@NotBlank @Size(max = 254) String email,
			@NotNull @Size(max = 128) String password) {

		LoginRequest {
			email = email == null ? null : email.strip();
		}

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

	/** Thrown when a cookie-authenticated request lacks {@code X-Requested-With: nimbus}; becomes a 403. */
	static class NotFromAppException extends RuntimeException {

		NotFromAppException() {
			super("This request must come from the Nimbus app");
		}

	}

}
