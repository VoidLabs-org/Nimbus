package com.nimbus.api.identity.internal;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

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
 * page with a short code. Either way the page the sign-in started from ({@link ReturnPath}) is passed on as
 * {@code returnTo}, and the handshake's short-lived HTTP session is dropped; nothing else in the API uses one.
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
		var returnTo = ReturnPath.recall(request);
		endHandshake(request);
		var provider = "";
		try {
			var login = (OAuth2AuthenticationToken) authentication;
			provider = login.getAuthorizedClientRegistrationId();
			var user = externalSignIn.signIn(profileOf(login));
			var refreshToken = sessions.start(user, request.getHeader(HttpHeaders.USER_AGENT));
			response.addHeader(HttpHeaders.SET_COOKIE,
					AuthController.refreshCookie(refreshToken.value(), refreshToken.lifetime()).toString());
			redirect(response, "/auth/callback", returnTo);
		}
		catch (ExternalSignIn.EmailUnverifiedException e) {
			redirect(response, loginError("email_unverified", provider), returnTo);
		}
		catch (RuntimeException e) {
			log.warn("Sign-in with a provider failed", e);
			redirect(response, loginError("failed", provider), returnTo);
		}
	}

	@Override
	public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException exception) throws IOException {
		var returnTo = ReturnPath.recall(request);
		endHandshake(request);
		// The provider reports "access_denied" when the person declines on its consent screen.
		var declined = exception instanceof OAuth2AuthenticationException oauth
				&& "access_denied".equals(oauth.getError().getErrorCode());
		if (!declined) {
			log.warn("Sign-in with a provider failed", exception);
		}
		var provider = providerOf(request);
		redirect(response, loginError(declined ? "cancelled" : "failed", provider), returnTo);
	}

	// Tells the login page which provider the error is about, so it can say "Google" or "GitHub". The failure
	// handler only has the callback URL (/api/auth/oauth2/callback/<provider>) to tell; anything unknown is left out.
	private static String loginError(String code, String provider) {
		var known = GoogleProfiles.PROVIDER.equals(provider) || GithubProfiles.PROVIDER.equals(provider);
		return "/login?error=" + code + (known ? "&provider=" + provider : "");
	}

	private static String providerOf(HttpServletRequest request) {
		var path = request.getRequestURI();
		return path == null ? "" : path.substring(path.lastIndexOf('/') + 1);
	}

	// Always to the public URL: behind the dev proxy or a load balancer the request's own host is the API's,
	// and the browser would land on a server that has no web app.
	private void redirect(HttpServletResponse response, String path, Optional<String> returnTo) throws IOException {
		var query = returnTo.map(page -> (path.contains("?") ? "&" : "?") + ReturnPath.PARAMETER + "="
				+ URLEncoder.encode(page, StandardCharsets.UTF_8)).orElse("");
		response.sendRedirect(publicUrl + path + query);
	}

	private static ExternalProfile profileOf(OAuth2AuthenticationToken login) {
		var provider = login.getAuthorizedClientRegistrationId();
		if (GoogleProfiles.PROVIDER.equals(provider)) {
			return GoogleProfiles.from(login.getPrincipal().getAttributes());
		}
		if (GithubProfiles.PROVIDER.equals(provider)) {
			return GithubProfiles.from(login.getPrincipal().getAttributes());
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
