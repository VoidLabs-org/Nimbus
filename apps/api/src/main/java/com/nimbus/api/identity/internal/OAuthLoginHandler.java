package com.nimbus.api.identity.internal;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * Ends the OAuth handshake. On success it signs the User in like any other sign-in: a session, and its refresh
 * token in the cookie only. The browser is then sent to {@code /auth/callback}, where the web app trades the
 * cookie for an access token, so no token ever appears in a URL. On failure the browser goes back to the sign-in
 * page with a short code. Either way the handshake's short-lived HTTP session is dropped; nothing else in the
 * API uses one.
 */
@Component
class OAuthLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

	private static final Logger log = LoggerFactory.getLogger(OAuthLoginHandler.class);

	private final ExternalSignIn externalSignIn;

	private final Sessions sessions;

	/** Where the browser sees Nimbus, without a trailing slash. */
	private final String publicUrl;

	OAuthLoginHandler(ExternalSignIn externalSignIn, Sessions sessions, AuthProperties properties) {
		this.externalSignIn = externalSignIn;
		this.sessions = sessions;
		this.publicUrl = properties.publicUrl();
	}

	@Override
	public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
			Authentication authentication) throws IOException {
		endHandshake(request);
		try {
			var login = (OAuth2AuthenticationToken) authentication;
			var user = externalSignIn.signIn(profileOf(login));
			var refreshToken = sessions.start(user);
			response.addHeader(HttpHeaders.SET_COOKIE,
					AuthController.refreshCookie(refreshToken.value(), refreshToken.lifetime()).toString());
			redirect(response, "/auth/callback");
		}
		catch (ExternalSignIn.EmailUnverifiedException e) {
			redirect(response, "/login?error=email_unverified");
		}
		catch (RuntimeException e) {
			log.warn("Sign-in with a provider failed", e);
			redirect(response, "/login?error=failed");
		}
	}

	@Override
	public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException exception) throws IOException {
		endHandshake(request);
		// Google reports "access_denied" when the person declines on its consent screen.
		var declined = exception instanceof OAuth2AuthenticationException oauth
				&& "access_denied".equals(oauth.getError().getErrorCode());
		if (!declined) {
			log.warn("Sign-in with a provider failed", exception);
		}
		redirect(response, declined ? "/login?error=cancelled" : "/login?error=failed");
	}

	// Always to the public URL: behind the dev proxy or a load balancer the request's own host is the API's,
	// and the browser would land on a server that has no web app.
	private void redirect(HttpServletResponse response, String path) throws IOException {
		response.sendRedirect(publicUrl + path);
	}

	private static ExternalProfile profileOf(OAuth2AuthenticationToken login) {
		var provider = login.getAuthorizedClientRegistrationId();
		if (GoogleProfiles.PROVIDER.equals(provider)) {
			return GoogleProfiles.from(login.getPrincipal().getAttributes());
		}
		throw new IllegalStateException("No profile mapping for provider " + provider);
	}

	private static void endHandshake(HttpServletRequest request) {
		var session = request.getSession(false);
		if (session != null) {
			session.invalidate();
		}
	}

}
