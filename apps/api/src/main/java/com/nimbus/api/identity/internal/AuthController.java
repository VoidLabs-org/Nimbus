package com.nimbus.api.identity.internal;

import java.time.Duration;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

	/** Sent only to /api/auth and never readable by page scripts. */
	static final String REFRESH_COOKIE = "refresh_token";

	/**
	 * The Mobile app sends this header with {@value #MOBILE}: it keeps the refresh token itself, in the phone's secure
	 * storage, so the token travels in the body instead of a cookie (ADR 0010).
	 */
	static final String CLIENT_HEADER = "X-Nimbus-Client";

	static final String MOBILE = "mobile";

	private final Registration registration;

	private final SignIn signIn;

	private final AccessTokens accessTokens;

	private final Sessions sessions;

	private final TwoStepSignIn twoStepSignIn;

	private final ProfilePictures pictures;

	AuthController(Registration registration, SignIn signIn, AccessTokens accessTokens, Sessions sessions,
			TwoStepSignIn twoStepSignIn, ProfilePictures pictures) {
		this.pictures = pictures;
		this.registration = registration;
		this.signIn = signIn;
		this.accessTokens = accessTokens;
		this.sessions = sessions;
		this.twoStepSignIn = twoStepSignIn;
	}

	@PostMapping("/register")
	ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
		var user = registration.register(request.displayName(), request.email(), request.password(),
				http.getRemoteAddr());
		return signedIn(HttpStatus.CREATED, user, http, false);
	}

	/**
	 * A User with Two-step verification gets no Session for the password alone: the answer says a Sign-in code is
	 * needed, and a cookie holds the pending sign-in that {@code /two-step} finishes.
	 */
	@PostMapping("/login")
	ResponseEntity<?> login(@Valid @RequestBody LoginRequest request,
			@CookieValue(name = RememberedBrowsers.COOKIE, required = false) String remembered, HttpServletRequest http) {
		var user = signIn.signIn(request.email(), request.password(), http.getRemoteAddr());
		var pending = twoStepSignIn.begin(user, null, remembered);
		if (pending.isPresent()) {
			return ResponseEntity.ok()
				.header(HttpHeaders.SET_COOKIE, pending.get().toString())
				.body(new TwoStepRequiredResponse(true));
		}
		return signedIn(HttpStatus.OK, user, http, true);
	}

	/**
	 * The second step of a sign-in: a right Sign-in code or Recovery code starts the Session as {@code /login} does
	 * and ends the pending sign-in. The pending cookie is the only credential, so {@link NimbusHeaderGate} checks its header.
	 */
	@PostMapping("/two-step")
	ResponseEntity<AuthResponse> twoStep(@CookieValue(name = PendingSignIns.COOKIE, required = false) String pendingId,
			@Valid @RequestBody TwoStepRequest request, HttpServletRequest http) {
		var signedIn = twoStepSignIn.finish(pendingId, request.code(), request.recoveryCode(),
				Boolean.TRUE.equals(request.rememberBrowser()), http.getHeader(HttpHeaders.USER_AGENT));
		var cookies = signedIn.rememberedToken() == null ? new ResponseCookie[] { PendingSignIns.clearedCookie() }
				: new ResponseCookie[] { PendingSignIns.clearedCookie(),
						RememberedBrowsers.cookie(signedIn.rememberedToken()) };
		return withSession(HttpStatus.OK, signedIn.user(), signedIn.token(), http, cookies);
	}

	/**
	 * Exchanges the refresh cookie for a new one and a fresh access token. The cookie is the only credential, so
	 * the request must also carry a header that cross-site forms can't set ({@link NimbusHeaderGate}). The Mobile app
	 * sends its token in the body instead and gets the new one back there.
	 */
	@PostMapping("/refresh")
	ResponseEntity<AuthResponse> refresh(@CookieValue(name = REFRESH_COOKIE, required = false) String cookie,
			@RequestBody(required = false) RefreshTokenRequest body, HttpServletRequest http) {
		var refreshed = sessions.refresh(refreshToken(cookie, body, http), http.getRemoteAddr());
		return withSession(HttpStatus.OK, refreshed.user(), refreshed.token(), http);
	}

	/**
	 * Ends this browser's session only and clears its cookie. Like {@code /refresh} the cookie is the only
	 * credential, so it needs the same header; the Mobile app sends its token in the body. Succeeds even if there was
	 * no session left to end.
	 */
	@PostMapping("/logout")
	ResponseEntity<Void> logout(@CookieValue(name = REFRESH_COOKIE, required = false) String cookie,
			@RequestBody(required = false) RefreshTokenRequest body, HttpServletRequest http) {
		sessions.end(refreshToken(cookie, body, http));
		return ResponseEntity.noContent()
			.header(HttpHeaders.SET_COOKIE, clearedRefreshCookie().toString())
			.build();
	}

	/**
	 * Starts a session: the access token goes in the body, the refresh token only in the cookie.
	 *
	 * @param announce whether to send a new-sign-in Security alert; registration's first session sends none
	 */
	private ResponseEntity<AuthResponse> signedIn(HttpStatus status, User user, HttpServletRequest http,
			boolean announce, ResponseCookie... alsoSet) {
		return withSession(status, user, sessions.start(user, http.getHeader(HttpHeaders.USER_AGENT), announce), http,
				alsoSet);
	}

	private ResponseEntity<AuthResponse> withSession(HttpStatus status, User user, Sessions.IssuedToken refreshToken,
			HttpServletRequest http, ResponseCookie... alsoSet) {
		var mobile = fromMobileApp(http);
		var response = ResponseEntity.status(status);
		if (!mobile) {
			response.header(HttpHeaders.SET_COOKIE, refreshCookie(refreshToken.value(), refreshToken.lifetime()).toString());
		}
		for (var cookie : alsoSet) {
			response.header(HttpHeaders.SET_COOKIE, cookie.toString());
		}
		return response.body(new AuthResponse(accessTokens.issueFor(user, refreshToken.sessionId()),
				mobile ? refreshToken.value() : null, UserResponse.from(user, pictures)));
	}

	static boolean fromMobileApp(HttpServletRequest http) {
		return MOBILE.equals(http.getHeader(CLIENT_HEADER));
	}

	/** The Mobile app's token comes only from the body, a browser's only from the cookie: neither falls back. */
	private static String refreshToken(String cookie, RefreshTokenRequest body, HttpServletRequest http) {
		if (!fromMobileApp(http)) {
			return cookie;
		}
		return body == null ? null : body.refreshToken();
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
			@NotBlank @Size(max = ValidEmail.MAX_LENGTH) String email,
			@NotNull @Size(max = ValidPassword.MAX_LENGTH) String password) {

		LoginRequest {
			email = email == null ? null : email.strip();
		}

	}

	/** Surrounding whitespace is dropped before validation; passwords are kept exactly as typed. */
	record RegisterRequest(
			@ValidDisplayName String displayName,
			@ValidEmail String email,
			@ValidPassword String password) {

		RegisterRequest {
			displayName = DisplayName.normalize(displayName);
			email = email == null ? null : email.strip();
		}

	}

	/** @param refreshToken only for the Mobile app; a browser gets it in the cookie, and the field is left out */
	record AuthResponse(String accessToken, @JsonInclude(JsonInclude.Include.NON_NULL) String refreshToken,
			UserResponse user) {
	}

	record TwoStepRequiredResponse(boolean twoStepRequired) {
	}

	/** The Mobile app's refresh token, for {@code /refresh} and {@code /logout}. */
	record RefreshTokenRequest(String refreshToken) {
	}

	/**
	 * A Sign-in code, or a Recovery code instead when the User lost their phone. Anything that isn't 6 digits is simply
	 * a wrong Sign-in code.
	 *
	 * @param rememberBrowser "Don't ask again on this device for 30 days"; null counts as not ticked
	 */
	record TwoStepRequest(@Size(max = 64) String code, @Size(max = 64) String recoveryCode, Boolean rememberBrowser) {
	}

}
