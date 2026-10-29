package com.nimbus.api.identity.internal;

import com.nimbus.api.identity.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Where the Desktop app trades the one-time code from the system browser for the sign-in or connect (ADR 0008).
 */
@RestController
@RequestMapping("/api/auth/desktop")
class DesktopSignInController {

	private final DesktopSignIn desktopSignIn;

	private final CurrentUser currentUser;

	DesktopSignInController(DesktopSignIn desktopSignIn, CurrentUser currentUser) {
		this.desktopSignIn = desktopSignIn;
		this.currentUser = currentUser;
	}

	/**
	 * Like the end of the callback in a browser: the refresh cookie only, after which the app loads
	 * {@code /auth/callback}; or, for a User with Two-step verification, the pending cookie and {@code /login/two-step}.
	 * Public, and behind {@link NimbusHeaderGate}, since it sets cookies.
	 */
	@PostMapping("/exchange")
	ResponseEntity<ExchangeResponse> exchange(@Valid @RequestBody CodeRequest request,
			@CookieValue(name = RememberedBrowsers.COOKIE, required = false) String remembered, HttpServletRequest http) {
		var outcome = desktopSignIn.signIn(request.code(), request.verifier(), remembered,
				http.getHeader(HttpHeaders.USER_AGENT));
		if (outcome.pending() != null) {
			return ResponseEntity.ok()
				.header(HttpHeaders.SET_COOKIE, outcome.pending().toString())
				.body(new ExchangeResponse(true));
		}
		var session = outcome.session();
		return ResponseEntity.ok()
			.header(HttpHeaders.SET_COOKIE, AuthController.refreshCookie(session.value(), session.lifetime()).toString())
			.body(new ExchangeResponse(false));
	}

	/** Connects the provider to the signed-in User, who asked for it on the Security page. */
	@PostMapping("/connect")
	ConnectResponse connect(@AuthenticationPrincipal Jwt token, @Valid @RequestBody CodeRequest request) {
		return new ConnectResponse(desktopSignIn.connect(request.code(), request.verifier(), currentUser.id(),
				UsersController.sessionOf(token)));
	}

	/** Anything too long is simply a code that doesn't fit. */
	record CodeRequest(@Size(max = 256) String code, @Size(max = 256) String verifier) {
	}

	record ExchangeResponse(boolean twoStepRequired) {
	}

	record ConnectResponse(String provider) {
	}

}
