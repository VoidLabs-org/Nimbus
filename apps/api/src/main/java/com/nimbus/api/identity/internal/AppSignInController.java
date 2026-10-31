package com.nimbus.api.identity.internal;

import java.util.List;
import java.util.Objects;

import com.nimbus.api.identity.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Where the apps trade the one-time code from a browser for the sign-in or connect: the app sign-in. The Desktop
 * app's old {@code /api/auth/desktop/*} paths stay as aliases until it has moved.
 */
@RestController
@RequestMapping("/api/auth")
class AppSignInController {

	private final AppSignIn appSignIn;

	private final CurrentUser currentUser;

	private final SessionResponses responses;

	AppSignInController(AppSignIn appSignIn, CurrentUser currentUser, SessionResponses responses) {
		this.appSignIn = appSignIn;
		this.currentUser = currentUser;
		this.responses = responses;
	}

	/**
	 * Like the end of the callback in a browser. For the Desktop app the refresh cookie only, after which it loads
	 * {@code /auth/callback}; or, for a User with Two-step verification, the pending cookie and {@code /login/two-step}.
	 * For the Mobile app ({@code X-Nimbus-Client: mobile}) what password sign-in answers: the tokens and the User in
	 * the body, or {@code twoStepRequired} with a {@code pendingToken}; no cookies. Public, and behind
	 * {@link NimbusHeaderGate}, since it sets cookies for the Desktop app.
	 */
	@PostMapping({ "/app/exchange", "/desktop/exchange" })
	ResponseEntity<?> exchange(@Valid @RequestBody CodeRequest request,
			@CookieValue(name = RememberedBrowsers.COOKIE, required = false) String remembered, HttpServletRequest http) {
		var mobile = AuthController.fromMobileApp(http);
		var outcome = appSignIn.signIn(request.code(), request.verifier(),
				mobile ? request.rememberedTokensOrNone() : cookieOnly(remembered),
				http.getHeader(HttpHeaders.USER_AGENT));
		if (mobile) {
			if (outcome.pendingId() != null) {
				return ResponseEntity.ok(new AuthController.TwoStepRequiredResponse(true, outcome.pendingId()));
			}
			return responses.withSession(HttpStatus.OK, outcome.started().user(), outcome.started().token(), null,
					http);
		}
		if (outcome.pendingId() != null) {
			return ResponseEntity.ok()
				.header(HttpHeaders.SET_COOKIE, PendingSignIns.cookie(outcome.pendingId()).toString())
				.body(new ExchangeResponse(true));
		}
		var session = outcome.started().token();
		return ResponseEntity.ok()
			.header(HttpHeaders.SET_COOKIE, AuthController.refreshCookie(session.value(), session.lifetime()).toString())
			.body(new ExchangeResponse(false));
	}

	private static List<String> cookieOnly(String remembered) {
		return remembered == null ? List.of() : List.of(remembered);
	}

	/** Connects the provider to the signed-in User, who asked for it on the Security page. */
	@PostMapping({ "/app/connect", "/desktop/connect" })
	ConnectResponse connect(@AuthenticationPrincipal Jwt token, @Valid @RequestBody CodeRequest request) {
		return new ConnectResponse(appSignIn.connect(request.code(), request.verifier(), currentUser.id(),
				UsersController.sessionOf(token)));
	}

	/**
	 * Anything too long is simply a code that doesn't fit.
	 *
	 * @param rememberedTokens only from the Mobile app: each User's remembered device it keeps, which the Desktop app
	 * sends as its cookie instead
	 */
	record CodeRequest(@Size(max = 256) String code, @Size(max = 256) String verifier,
			@Size(max = 20) List<@Size(max = 128) String> rememberedTokens) {

		List<String> rememberedTokensOrNone() {
			return rememberedTokens == null ? List.of() : rememberedTokens.stream().filter(Objects::nonNull).toList();
		}

	}

	record ExchangeResponse(boolean twoStepRequired) {
	}

	record ConnectResponse(String provider) {
	}

}
