package com.nimbus.api.identity.internal;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * The answer to anything that starts or renews a Session: the access token and the User in the body, and the refresh
 * token in the cookie for a browser or in the body for the Mobile app (ADR 0010). Shared by the sign-in endpoints and
 * the apps' provider sign-in, so the two modes can't drift apart.
 */
@Component
class SessionResponses {

	private final AccessTokens accessTokens;

	private final ProfilePictures pictures;

	SessionResponses(AccessTokens accessTokens, ProfilePictures pictures) {
		this.accessTokens = accessTokens;
		this.pictures = pictures;
	}

	/**
	 * @param rememberedToken the Mobile app's new remembered device, for the body; null for none, and for a browser
	 * @param alsoSet cookies a browser gets as well, such as the cleared pending sign-in
	 */
	ResponseEntity<AuthController.AuthResponse> withSession(HttpStatus status, User user,
			Sessions.IssuedToken refreshToken, String rememberedToken, HttpServletRequest http,
			ResponseCookie... alsoSet) {
		var mobile = AuthController.fromMobileApp(http);
		var response = ResponseEntity.status(status);
		if (!mobile) {
			response.header(HttpHeaders.SET_COOKIE,
					AuthController.refreshCookie(refreshToken.value(), refreshToken.lifetime()).toString());
		}
		for (var cookie : alsoSet) {
			response.header(HttpHeaders.SET_COOKIE, cookie.toString());
		}
		return response.body(new AuthController.AuthResponse(accessTokens.issueFor(user, refreshToken.sessionId()),
				mobile ? refreshToken.value() : null, rememberedToken, UserResponse.from(user, pictures)));
	}

}
