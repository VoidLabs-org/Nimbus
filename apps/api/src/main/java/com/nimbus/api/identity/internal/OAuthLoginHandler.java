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
import org.springframework.web.util.WebUtils;

/**
 * Ends the OAuth handshake. On success it signs the User in like any other sign-in: a session, and its refresh
 * token in the cookie only. The browser is then sent to {@code /auth/callback}, where the web app trades the
 * cookie for an access token, so no token ever appears in a URL. A User with Two-step verification gets no session
 * yet: a pending sign-in cookie, and {@code /login/two-step} for the code. On failure the browser goes back to the sign-in
 * page with a short code. Either way the page the sign-in started from ({@link ReturnPath}) is passed on as
 * {@code returnTo}, and the handshake's short-lived HTTP session is dropped; nothing else in the API uses one. A
 * handshake the Desktop app started ends at the app instead ({@link DesktopReturn}).
 */
@Component
class OAuthLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

	private static final Logger log = LoggerFactory.getLogger(OAuthLoginHandler.class);

	private final ExternalSignIn externalSignIn;

	private final LinkTickets tickets;

	/** Where the browser sees Nimbus, without a trailing slash. */
	private final String publicUrl;

	private final TwoStepSignIn twoStepSignIn;

	private final DesktopCodes desktopCodes;

	OAuthLoginHandler(ExternalSignIn externalSignIn, LinkTickets tickets,
			TwoStepSignIn twoStepSignIn, DesktopCodes desktopCodes, AuthProperties properties) {
		this.externalSignIn = externalSignIn;
		this.tickets = tickets;
		this.twoStepSignIn = twoStepSignIn;
		this.desktopCodes = desktopCodes;
		this.publicUrl = properties.publicUrl();
	}

	@Override
	public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
			Authentication authentication) throws IOException {
		var returnTo = ReturnPath.recall(request);
		var ticket = LinkTicket.recall(request);
		var desktop = DesktopReturn.recall(request);
		endHandshake(request);
		if (desktop.isPresent()) {
			handToDesktop(response, (OAuth2AuthenticationToken) authentication, ticket, desktop.get());
			return;
		}
		if (ticket.isPresent()) {
			connect(request, response, (OAuth2AuthenticationToken) authentication, ticket.get());
			return;
		}
		var provider = "";
		try {
			var login = (OAuth2AuthenticationToken) authentication;
			provider = login.getAuthorizedClientRegistrationId();
			var profile = profileOf(login);
			// The provider's consent alone is not enough for a User with Two-step verification (ADR 0005): nothing is
			// stored (no link, no Session), and the code page finishes the sign-in.
			// The remembered cookie is SameSite=Lax, so it comes along on this redirect back from the provider.
			var remembered = WebUtils.getCookie(request, RememberedBrowsers.COOKIE);
			var pending = externalSignIn.whoSignsIn(profile)
				.flatMap(existing -> twoStepSignIn.begin(existing, profile,
						remembered == null ? null : remembered.getValue()));
			if (pending.isPresent()) {
				response.addHeader(HttpHeaders.SET_COOKIE, pending.get().toString());
				redirect(response, "/login/two-step", returnTo);
				return;
			}
			var refreshToken = externalSignIn.startSession(profile, request.getHeader(HttpHeaders.USER_AGENT));
			response.addHeader(HttpHeaders.SET_COOKIE,
					AuthController.refreshCookie(refreshToken.value(), refreshToken.lifetime()).toString());
			redirect(response, "/auth/callback", returnTo);
		}
		catch (ExternalSignIn.EmailUnverifiedException e) {
			redirect(response, loginError("email_unverified", provider), returnTo);
		}
		catch (ExternalSignIn.ProviderDisconnectedException e) {
			redirect(response, loginError("disconnected", provider), returnTo);
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
		var ticket = LinkTicket.recall(request);
		var desktop = DesktopReturn.recall(request);
		if (desktop.isPresent() && isOutdatedTab(exception)) {
			// "Open the browser again" started a newer handshake in this session, and this tab is the older one. The
			// newer one is still under way, so neither it nor the app's attempt is ended; this tab only says to use it.
			response.sendRedirect(publicUrl + "/auth/desktop-done?outdated=1");
			return;
		}
		endHandshake(request);
		// The provider reports "access_denied" when the person declines on its consent screen.
		var declined = exception instanceof OAuth2AuthenticationException oauth
				&& "access_denied".equals(oauth.getError().getErrorCode());
		if (!declined) {
			log.warn("Sign-in with a provider failed", exception);
		}
		var provider = providerOf(request);
		if (desktop.isPresent()) {
			ticket.ifPresent(tickets::discard);
			response.sendRedirect(desktop.get().withError(declined ? "cancelled" : "failed", provider));
			return;
		}
		if (ticket.isPresent()) {
			// The connect is over, so its ticket is no use any more.
			tickets.discard(ticket.get());
			redirect(response, securityError(declined ? "cancelled" : "failed", provider), Optional.empty());
			return;
		}
		redirect(response, loginError(declined ? "cancelled" : "failed", provider), returnTo);
	}

	/**
	 * Ends a handshake the Desktop app started (ADR 0008) without signing anyone in here, in the browser: what the
	 * provider sent waits under a one-time code, which the browser takes to the app's port. The app finishes the
	 * sign-in or the connect with it ({@link DesktopSignIn}), so the cookies, Two-step verification and the Session's
	 * device are the app's.
	 */
	private void handToDesktop(HttpServletResponse response, OAuth2AuthenticationToken login,
			Optional<String> ticket, DesktopReturn desktop) throws IOException {
		var provider = login.getAuthorizedClientRegistrationId();
		String code;
		try {
			code = desktopCodes.issue(desktop.challenge(), profileOf(login), ticket.orElse(null));
		}
		catch (RuntimeException e) {
			log.warn("Sign-in with a provider for the Desktop app failed", e);
			ticket.ifPresent(tickets::discard);
			response.sendRedirect(desktop.withError("failed", provider));
			return;
		}
		response.sendRedirect(desktop.withCode(code));
	}

	/**
	 * Ends a handshake that was started to connect a provider to the User who asked for it, not to sign anyone in:
	 * no session, no cookie. The browser goes back to the Security page with the result.
	 */
	private void connect(HttpServletRequest request, HttpServletResponse response, OAuth2AuthenticationToken login,
			String ticketValue) throws IOException {
		var provider = login.getAuthorizedClientRegistrationId();
		try {
			// Only the browser that asked for the ticket holds the cookie that goes with it.
			var binder = WebUtils.getCookie(request, LinkTickets.COOKIE);
			var ticket = tickets.redeem(ticketValue, provider, binder == null ? null : binder.getValue());
			if (ticket.isEmpty()) {
				redirect(response, securityError("expired", provider), Optional.empty());
				return;
			}
			externalSignIn.connect(ticket.get().userId(), ticket.get().sessionId(), profileOf(login));
			redirect(response, "/settings/security?connected=" + provider, Optional.empty());
		}
		catch (ExternalSignIn.EmailUnverifiedException e) {
			redirect(response, securityError("email_unverified", provider), Optional.empty());
		}
		catch (ExternalSignIn.AlreadyLinkedException e) {
			redirect(response, securityError("already_linked", provider), Optional.empty());
		}
		catch (ExternalSignIn.ProviderAlreadyConnectedException e) {
			redirect(response, securityError("already_connected", provider), Optional.empty());
		}
		catch (ExternalSignIn.ConnectExpiredException e) {
			redirect(response, securityError("expired", provider), Optional.empty());
		}
		catch (RuntimeException e) {
			log.warn("Connecting a provider failed", e);
			redirect(response, securityError("failed", provider), Optional.empty());
		}
	}

	private static String securityError(String code, String provider) {
		return "/settings/security?error=" + code + providerParameter(provider);
	}

	/**
	 * {@code &provider=<provider>} for Google or GitHub, so a page can name the provider an error is about; nothing for
	 * anything else, which is never echoed back.
	 */
	static String providerParameter(String provider) {
		var known = GoogleProfiles.PROVIDER.equals(provider) || GithubProfiles.PROVIDER.equals(provider);
		return known ? "&provider=" + provider : "";
	}

	/**
	 * Whether the callback came from a tab whose handshake is no longer the session's: Spring keeps one authorization
	 * request per session, and its state no longer matches this one.
	 */
	private static boolean isOutdatedTab(AuthenticationException exception) {
		return exception instanceof OAuth2AuthenticationException oauth
				&& "authorization_request_not_found".equals(oauth.getError().getErrorCode());
	}

	// Tells the login page which provider the error is about, so it can say "Google" or "GitHub". The failure
	// handler only has the callback URL (/api/auth/oauth2/callback/<provider>) to tell; anything unknown is left out.
	private static String loginError(String code, String provider) {
		return "/login?error=" + code + providerParameter(provider);
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
