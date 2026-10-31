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
 * Signing in with Google or GitHub from the Mobile app, through the phone's in-app browser: the callback hands a
 * one-time code to {@code nimbus://auth}, and the app trades it, with its verifier, at the app sign-in exchange, which
 * answers the tokens in the body (ADR 0010). The code's rules (single use, a minute, the verifier) are the Desktop
 * app's, which {@link DesktopSignInTests} covers in full.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class MobileAppSignInTests {

	private static final String PHONE_AGENT = "Nimbus/1.0.0 (Android 15)";

	private static final String VERIFIER = "a-verifier-the-mobile-app-made-and-kept-to-itself";

	private static final String RETURN = "nimbus://auth";

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
	RememberedBrowsers rememberedBrowsers;

	@Autowired
	MovableClock clock;

	@Test
	void theCallbackHandsACodeToTheAppsLinkAndSignsNobodyInInTheBrowser() throws Exception {
		googleUser("ma1@example.com", "g-ma-1");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(startedForMobile(), response, google("g-ma-1", "ma1@example.com"));

		assertThat(response.getRedirectedUrl()).startsWith(RETURN + "?code=");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
	}

	@Test
	void theExchangeAnswersTheTokensInTheBodyAndSignsANewUserUp() throws Exception {
		var code = codeFor(google("g-ma-2", "ma2@example.com"));

		var result = exchange(code, VERIFIER, null).expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)).isEmpty();
		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.user.email")).isEqualTo("ma2@example.com");
		String refreshToken = JsonPath.read(result.getResponseBody(), "$.refreshToken");
		var refreshed = sessions.refresh(refreshToken, "client-ma-2");
		assertThat(sessions.listFor(refreshed.user().getId(), refreshed.token().sessionId()))
			.extracting(Sessions.SessionView::device)
			.containsExactly("Nimbus for Android");
		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + JsonPath.<String>read(result.getResponseBody(), "$.accessToken"))
			.exchange().expectStatus().isOk();
	}

	@Test
	void aUserWithTwoStepVerificationGetsAPendingTokenForTheCodeScreen() throws Exception {
		var user = googleUser("ma3@example.com", "g-ma-3");
		var key = turnOn(user);
		var code = codeFor(google("g-ma-3", "ma3@example.com"));

		var result = exchange(code, VERIFIER, null).expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)).isEmpty();
		assertThat(JsonPath.<Boolean>read(result.getResponseBody(), "$.twoStepRequired")).isTrue();
		String pending = JsonPath.read(result.getResponseBody(), "$.pendingToken");
		client.post().uri("/api/auth/two-step").header("X-Nimbus-Client", "mobile")
			.body(Map.of("pendingToken", pending, "code", SignInCodes.codeFor(key, clock.instant()))).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$.refreshToken").isNotEmpty();
	}

	// The app can't know beforehand whom the provider signs in as, so it sends every User's remembered device it keeps.
	@Test
	void theRememberedDeviceOfTheUserWhoSignsInSkipsTheCode() throws Exception {
		var user = googleUser("ma4@example.com", "g-ma-4");
		turnOn(user);
		var someoneElse = googleUser("ma4-other@example.com", "g-ma-4-other");
		var tokens = List.of(rememberedBrowsers.remember(someoneElse.getId()), rememberedBrowsers.remember(user.getId()));
		var code = codeFor(google("g-ma-4", "ma4@example.com"));

		exchange(code, VERIFIER, tokens).expectStatus().isOk().expectBody()
			.jsonPath("$.refreshToken").isNotEmpty()
			.jsonPath("$.twoStepRequired").doesNotExist();
	}

	@Test
	void anotherUsersRememberedDeviceStillAsksForTheCode() throws Exception {
		var user = googleUser("ma5@example.com", "g-ma-5");
		turnOn(user);
		var someoneElse = googleUser("ma5-other@example.com", "g-ma-5-other");
		var code = codeFor(google("g-ma-5", "ma5@example.com"));

		exchange(code, VERIFIER, List.of(rememberedBrowsers.remember(someoneElse.getId()))).expectStatus().isOk()
			.expectBody().jsonPath("$.twoStepRequired").isEqualTo(true);
	}

	@Test
	void anUnverifiedEmailIsReportedAtTheExchange() throws Exception {
		var code = codeFor(oauth("google", Map.of("sub", "g-ma-6", "email", "ma6@example.com", "email_verified", false,
				"name", "Someone"), "sub"));

		exchange(code, VERIFIER, null).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("email_unverified");
	}

	@Test
	void declinedAtTheProviderGoesBackToTheAppsLinkAsCancelled() throws Exception {
		var request = startedForMobile();
		request.setRequestURI("/api/auth/oauth2/callback/google");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(request, response,
				new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

		assertThat(response.getRedirectedUrl()).isEqualTo(RETURN + "?error=cancelled&provider=google");
	}

	@Test
	void aWrongVerifierIsRefused() throws Exception {
		var code = codeFor(google("g-ma-8", "ma8@example.com"));

		exchange(code, "somebody-elses-verifier-that-is-long-enough-to-pass", null).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("expired");
	}

	@Test
	void aMobileStartWithoutAUsableChallengeIsAnOrdinaryBrowserSignIn() throws Exception {
		googleUser("ma9@example.com", "g-ma-9");
		for (var challenge : List.of("too-short", "")) {
			var request = new MockHttpServletRequest();
			request.setSession(new MockHttpSession());
			request.setParameter(AppReturn.MOBILE_CHALLENGE, challenge);
			AppReturn.remember(request);
			var response = new MockHttpServletResponse();

			handler.onAuthenticationSuccess(request, response, google("g-ma-9", "ma9@example.com"));

			assertThat(response.getRedirectedUrl()).as("challenge %s", challenge)
				.isEqualTo("http://localhost:3000/auth/callback");
		}
	}

	// The new path serves the Desktop app as the old one does: cookies, and the browser header.
	@Test
	void theAppExchangePathSignsTheDesktopAppInWithCookies() throws Exception {
		googleUser("ma10@example.com", "g-ma-10");
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(AppReturn.CHALLENGE, challengeOf(VERIFIER));
		request.setParameter(AppReturn.PORT, "53682");
		request.setParameter(AppReturn.NONCE, "attempt-nonce-0123456789");
		AppReturn.remember(request);
		request.removeAllParameters();
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(request, response, google("g-ma-10", "ma10@example.com"));
		var code = response.getRedirectedUrl().substring(response.getRedirectedUrl().indexOf("?code=") + 6);

		client.post().uri("/api/auth/app/exchange").body(Map.of("code", code, "verifier", VERIFIER)).exchange()
			.expectStatus().isForbidden();
		var result = client.post().uri("/api/auth/app/exchange").header("X-Requested-With", "nimbus")
			.body(Map.of("code", code, "verifier", VERIFIER)).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult();
		assertThat(result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE))
			.anyMatch(cookie -> cookie.startsWith(AuthController.REFRESH_COOKIE + "="));
		assertThat(result.getResponseBody()).doesNotContain("refreshToken");
	}

	private RestTestClient.ResponseSpec exchange(String code, String verifier, List<String> rememberedTokens) {
		var body = rememberedTokens == null ? Map.<String, Object>of("code", code, "verifier", verifier)
				: Map.<String, Object>of("code", code, "verifier", verifier, "rememberedTokens", rememberedTokens);
		return client.post().uri("/api/auth/app/exchange").header("X-Nimbus-Client", "mobile")
			.header(HttpHeaders.USER_AGENT, PHONE_AGENT).body(body).exchange();
	}

	private String codeFor(OAuth2AuthenticationToken login) throws Exception {
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(startedForMobile(), response, login);
		var url = response.getRedirectedUrl();
		assertThat(url).startsWith(RETURN + "?code=");
		return url.substring((RETURN + "?code=").length());
	}

	// A handshake started by the Mobile app, as ReturnPathAuthorizationRequestResolver leaves it.
	private static MockHttpServletRequest startedForMobile() throws NoSuchAlgorithmException {
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(AppReturn.MOBILE_CHALLENGE, challengeOf(VERIFIER));
		AppReturn.remember(request);
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

	private static OAuth2AuthenticationToken oauth(String provider, Map<String, Object> attributes, String nameKey) {
		var user = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"), attributes, nameKey);
		return new OAuth2AuthenticationToken(user, List.of(), provider);
	}

}
