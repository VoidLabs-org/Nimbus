package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.SignInCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Signing in with Google or GitHub from the Desktop app, through the system browser (ADR 0008): the callback hands a
 * one-time code to the app's localhost port, and the app trades it, with its verifier, for the sign-in. The callback
 * goes through {@link OAuthLoginHandler} with mock requests, as in {@code OAuthLoginHandlerTests}; the exchange
 * goes through the real endpoints.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class DesktopSignInTests {

	private static final String DESKTOP_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
			+ "(KHTML, like Gecko) desktop/0.0.0 Chrome/138.0.7204.35 Electron/44.7.0 Safari/537.36 Nimbus/0.0.0";

	private static final String VERIFIER = "a-verifier-the-desktop-app-made-and-kept-to-itself";

	private static final String NONCE = "attempt-nonce-0123456789";

	private static final String RETURN = "http://127.0.0.1:53682/" + NONCE;

	@Autowired
	RestTestClient client;

	@Autowired
	OAuthLoginHandler handler;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	LinkTickets tickets;

	@Autowired
	LinkedIdentities linkedIdentities;

	@Autowired
	MovableClock clock;

	@Test
	void theCallbackHandsACodeToTheAppAndSignsNobodyInInTheBrowser() throws Exception {
		googleUser("ds1@example.com", "g-ds-1");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(startedForDesktop(), response, google("g-ds-1", "ds1@example.com"));

		assertThat(response.getRedirectedUrl()).startsWith(RETURN + "?code=");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
	}

	@Test
	void theCodeAndVerifierStartASessionInTheAppLabelledAsTheApp() throws Exception {
		var user = googleUser("ds2@example.com", "g-ds-2");
		var code = codeFor(google("g-ds-2", "ds2@example.com"));

		var result = exchange(code, VERIFIER).expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(JsonPath.<Boolean>read(result.getResponseBody(), "$.twoStepRequired")).isFalse();
		var refreshed = sessions.refresh(cookieIn(result, AuthController.REFRESH_COOKIE), "client-ds-2");
		assertThat(refreshed.user().getId()).isEqualTo(user.getId());
		assertThat(sessions.listFor(user.getId(), refreshed.token().sessionId()))
			.extracting(Sessions.SessionView::device)
			.contains("Nimbus for Windows");
	}

	@Test
	void aCodeWorksOnce() throws Exception {
		googleUser("ds3@example.com", "g-ds-3");
		var code = codeFor(google("g-ds-3", "ds3@example.com"));
		exchange(code, VERIFIER).expectStatus().isOk();

		exchange(code, VERIFIER).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("expired");
	}

	// Another program that saw the code going to the app doesn't have the verifier; trying spends the code.
	@Test
	void aWrongVerifierIsRefusedAndEndsTheCode() throws Exception {
		googleUser("ds4@example.com", "g-ds-4");
		var code = codeFor(google("g-ds-4", "ds4@example.com"));

		exchange(code, "somebody-elses-verifier-that-is-long-enough-to-pass").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("expired");
		exchange(code, VERIFIER).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("expired");
	}

	@Test
	void aCodeExpiresAfterAMinute() throws Exception {
		googleUser("ds5@example.com", "g-ds-5");
		var code = codeFor(google("g-ds-5", "ds5@example.com"));
		clock.advance(DesktopCodes.LIFETIME.plusSeconds(1));

		exchange(code, VERIFIER).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("expired");
	}

	@Test
	void anUnknownCodeIsExpired() {
		exchange("no-such-code", VERIFIER).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("expired");
	}

	// Its only credentials are in the body, but it sets cookies, so a cross-site form must not reach it.
	@Test
	void theExchangeMustComeFromTheNimbusApp() throws Exception {
		googleUser("ds6@example.com", "g-ds-6");
		var code = codeFor(google("g-ds-6", "ds6@example.com"));

		client.post().uri("/api/auth/desktop/exchange").header(HttpHeaders.USER_AGENT, DESKTOP_AGENT)
			.body(Map.of("code", code, "verifier", VERIFIER)).exchange().expectStatus().isForbidden();
	}

	@Test
	void aUserWithTwoStepVerificationIsAskedForTheCodeInTheApp() throws Exception {
		var user = googleUser("ds7@example.com", "g-ds-7");
		var key = turnOn(user);
		var code = codeFor(google("g-ds-7", "ds7@example.com"));

		var result = exchange(code, VERIFIER).expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(JsonPath.<Boolean>read(result.getResponseBody(), "$.twoStepRequired")).isTrue();
		assertThat(result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE))
			.noneMatch(cookie -> cookie.startsWith(AuthController.REFRESH_COOKIE + "="));
		client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie(PendingSignIns.COOKIE, cookieIn(result, PendingSignIns.COOKIE))
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange()
			.expectStatus().isOk();
	}

	// The app's remembered cookie counts, not the browser's: the browser never sees the second step.
	@Test
	void theAppsRememberedCookieSkipsTheSecondStep() throws Exception {
		var user = googleUser("ds8@example.com", "g-ds-8");
		var key = turnOn(user);
		var first = exchange(codeFor(google("g-ds-8", "ds8@example.com")), VERIFIER).expectStatus().isOk()
			.expectBody(String.class).returnResult();
		var remembered = cookieIn(client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie(PendingSignIns.COOKIE, cookieIn(first, PendingSignIns.COOKIE))
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()), "rememberBrowser", true)).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult(), RememberedBrowsers.COOKIE);

		var result = client.post().uri("/api/auth/desktop/exchange").header("X-Requested-With", "nimbus")
			.header(HttpHeaders.USER_AGENT, DESKTOP_AGENT).cookie(RememberedBrowsers.COOKIE, remembered)
			.body(Map.of("code", codeFor(google("g-ds-8", "ds8@example.com")), "verifier", VERIFIER)).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(JsonPath.<Boolean>read(result.getResponseBody(), "$.twoStepRequired")).isFalse();
		assertThat(cookieIn(result, AuthController.REFRESH_COOKIE)).isNotEmpty();
	}

	@Test
	void anUnverifiedEmailIsReportedAtTheExchange() throws Exception {
		var code = codeFor(oauth("google", Map.of("sub", "g-ds-9", "email", "ds9@example.com", "email_verified", false,
				"name", "Someone"), "sub"));

		exchange(code, VERIFIER).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("email_unverified");
	}

	@Test
	void declinedAtTheProviderGoesBackToTheAppAsCancelled() throws Exception {
		var request = startedForDesktop();
		request.setRequestURI("/api/auth/oauth2/callback/github");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(request, response,
				new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

		assertThat(response.getRedirectedUrl()).isEqualTo(RETURN + "?error=cancelled&provider=github");
	}

	// "Open the browser again" started a newer handshake in the same browser; finishing in the older tab must not end it.
	@Test
	void anOlderTabOfAnAttemptOpenedAgainLeavesTheNewerOneGoing() throws Exception {
		var request = startedForDesktop();
		var handshake = (MockHttpSession) request.getSession();
		request.setRequestURI("/api/auth/oauth2/callback/google");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(request, response,
				new OAuth2AuthenticationException(new OAuth2Error("authorization_request_not_found")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/auth/desktop-done?outdated=1");
		assertThat(handshake.isInvalid()).isFalse();
		assertThat(DesktopReturn.recall(request)).isPresent();
	}

	@Test
	void aConnectFromTheAppLinksTheProviderToTheUserWhoAsked() throws Exception {
		var user = googleUser("ds10@example.com", "g-ds-10");
		var session = sessions.start(user, null, false);
		var issued = tickets.issue(user.getId(), session.sessionId(), "github");
		var response = new MockHttpServletResponse();
		var request = startedForDesktop();
		request.setParameter(LinkTicket.PARAMETER, issued.ticket());
		LinkTicket.remember(request);
		// No binder cookie: it is in the app, not in the browser.
		handler.onAuthenticationSuccess(request, response, github("5050", "ds10@example.com"));
		var code = codeIn(response);

		client.post().uri("/api/auth/desktop/connect")
			.header("Authorization", "Bearer " + accessTokens.issueFor(user, session.sessionId()))
			.body(Map.of("code", code, "verifier", VERIFIER)).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$.provider").isEqualTo("github");

		assertThat(linkedIdentities.listFor(user.getId())).extracting(LinkedIdentities.LinkedIdentityView::provider)
			.containsExactlyInAnyOrder("google", "github");
	}

	// The ticket is bound to the Session that asked: a code someone else got can't connect to their own account.
	@Test
	void aConnectCodeOnlyWorksForTheSessionThatAskedAndNeverAsASignIn() throws Exception {
		var user = googleUser("ds11@example.com", "g-ds-11");
		var session = sessions.start(user, null, false);
		var issued = tickets.issue(user.getId(), session.sessionId(), "github");
		var request = startedForDesktop();
		request.setParameter(LinkTicket.PARAMETER, issued.ticket());
		LinkTicket.remember(request);
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(request, response, github("5151", "ds11@example.com"));
		var other = googleUser("ds11-other@example.com", "g-ds-11-other");
		var otherSession = sessions.start(other, null, false);

		client.post().uri("/api/auth/desktop/connect")
			.header("Authorization", "Bearer " + accessTokens.issueFor(other, otherSession.sessionId()))
			.body(Map.of("code", codeIn(response), "verifier", VERIFIER)).exchange()
			.expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("expired");
		assertThat(linkedIdentities.listFor(other.getId())).hasSize(1);

		var signInCode = codeFor(google("g-ds-11", "ds11@example.com"));
		client.post().uri("/api/auth/desktop/connect")
			.header("Authorization", "Bearer " + accessTokens.issueFor(user, session.sessionId()))
			.body(Map.of("code", signInCode, "verifier", VERIFIER)).exchange()
			.expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("expired");
	}

	@Test
	void aConnectCodeIsNoSignIn() throws Exception {
		var user = googleUser("ds12@example.com", "g-ds-12");
		var session = sessions.start(user, null, false);
		var issued = tickets.issue(user.getId(), session.sessionId(), "github");
		var request = startedForDesktop();
		request.setParameter(LinkTicket.PARAMETER, issued.ticket());
		LinkTicket.remember(request);
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(request, response, github("5252", "ds12@example.com"));

		exchange(codeIn(response), VERIFIER).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("expired");
	}

	// Only the app's own loopback address: a port that isn't one, or a challenge that isn't one, is not a Desktop start.
	@Test
	void aStartWithoutAUsableReturnIsAnOrdinaryBrowserSignIn() throws Exception {
		googleUser("ds13@example.com", "g-ds-13");
		for (var port : List.of("80", "70000", "53682x", "")) {
			var request = new MockHttpServletRequest();
			request.setSession(new MockHttpSession());
			request.setParameter(DesktopReturn.CHALLENGE, challengeOf(VERIFIER));
			request.setParameter(DesktopReturn.PORT, port);
			request.setParameter(DesktopReturn.NONCE, NONCE);
			DesktopReturn.remember(request);
			var response = new MockHttpServletResponse();

			handler.onAuthenticationSuccess(request, response, google("g-ds-13", "ds13@example.com"));

			assertThat(response.getRedirectedUrl()).as("port %s", port).isEqualTo("http://localhost:3000/auth/callback");
		}
	}

	private RestTestClient.ResponseSpec exchange(String code, String verifier) {
		return client.post().uri("/api/auth/desktop/exchange").header("X-Requested-With", "nimbus")
			.header(HttpHeaders.USER_AGENT, DESKTOP_AGENT).body(Map.of("code", code, "verifier", verifier)).exchange();
	}

	/** Runs the callback of a Desktop sign-in for the login and returns the code it hands to the app. */
	private String codeFor(OAuth2AuthenticationToken login) throws Exception {
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(startedForDesktop(), response, login);
		return codeIn(response);
	}

	private static String codeIn(MockHttpServletResponse response) {
		var url = response.getRedirectedUrl();
		assertThat(url).startsWith(RETURN + "?code=");
		return url.substring((RETURN + "?code=").length());
	}

	private static String cookieIn(EntityExchangeResult<?> result, String name) {
		var cookie = result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(header -> header.startsWith(name + "="))
			.findFirst()
			.orElseThrow(() -> new AssertionError("no " + name + " cookie was set"));
		return cookie.substring(name.length() + 1, cookie.indexOf(';'));
	}

	// A handshake started by the Desktop app, as ReturnPathAuthorizationRequestResolver leaves it.
	private static MockHttpServletRequest startedForDesktop() throws NoSuchAlgorithmException {
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(DesktopReturn.CHALLENGE, challengeOf(VERIFIER));
		request.setParameter(DesktopReturn.PORT, "53682");
		request.setParameter(DesktopReturn.NONCE, NONCE);
		DesktopReturn.remember(request);
		request.removeAllParameters();
		return request;
	}

	private static String challengeOf(String verifier) throws NoSuchAlgorithmException {
		var hash = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
		return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
	}

	private User googleUser(String email, String sub) {
		return externalSignIn.signIn(new ExternalProfile("google", sub, email, true, "Someone", null, email));
	}

	/** Turns on Two-step verification through the Security page's endpoints; returns the authenticator key. */
	private String turnOn(User user) {
		var token = accessTokens.issueFor(user, sessions.start(user, null, false).sessionId());
		String key = JsonPath.read(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.key");
		client.post().uri("/api/users/me/two-step/setup/verify").header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk();
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		// The code that proved the key counts as used, so the sign-in needs the next one.
		clock.advance(Duration.ofSeconds(30));
		return key;
	}

	private static OAuth2AuthenticationToken google(String sub, String email) {
		return oauth("google", Map.of("sub", sub, "email", email, "email_verified", true, "name", "Someone"), "sub");
	}

	private static OAuth2AuthenticationToken github(String id, String email) {
		return oauth("github", Map.of("id", Long.parseLong(id), "login", "octo-" + id, "name", "Octo",
				GithubProfiles.EMAILS_ATTRIBUTE, List.of(Map.of("email", email, "primary", true, "verified", true))),
				"id");
	}

	private static OAuth2AuthenticationToken oauth(String provider, Map<String, Object> attributes, String nameKey) {
		var user = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"), attributes, nameKey);
		return new OAuth2AuthenticationToken(user, List.of(), provider);
	}

}
