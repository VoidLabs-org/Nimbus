package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.SignInCodes;
import jakarta.servlet.http.Cookie;
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
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Continuing with Google or GitHub when Two-step verification is on (ADR 0005): the provider's consent alone starts no
 * Session, and the Sign-in code page finishes the sign-in. The callback goes through {@link OAuthLoginHandler} with
 * mock requests, as in {@code OAuthLoginHandlerTests}; the second step goes through the real endpoint.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class TwoStepProviderSignInTests {

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
	void aGoogleSignInAsksForTheCodeInsteadOfStartingASession() throws Exception {
		var user = googleUser("tsp1@example.com", "g-tsp-1");
		turnOn(user);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, google("g-tsp-1", "tsp1@example.com"));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login/two-step");
		var cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
		assertThat(cookies).noneMatch(cookie -> cookie.startsWith("refresh_token="));
		assertThat(cookies).singleElement().satisfies(cookie -> assertThat(cookie).startsWith("two_step_pending=")
			.contains("HttpOnly").contains("Secure").contains("SameSite=Strict").contains("Path=/api/auth/two-step"));
	}

	@Test
	void aGithubSignInAsksForTheCodeToo() throws Exception {
		var profile = new ExternalProfile("github", "4242", "tsp2@example.com", true, "Octo", null, "octo-tsp");
		var user = externalSignIn.signIn(profile);
		turnOn(user);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, github("4242", "tsp2@example.com"));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login/two-step");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).singleElement()
			.satisfies(cookie -> assertThat(cookie).startsWith("two_step_pending="));
	}

	@Test
	void thePageTheSignInStartedFromIsKept() throws Exception {
		var user = googleUser("tsp3@example.com", "g-tsp-3");
		turnOn(user);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(startedFrom("/projects/42?tab=board"), response,
				google("g-tsp-3", "tsp3@example.com"));

		assertThat(response.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/login/two-step?returnTo=%2Fprojects%2F42%3Ftab%3Dboard");
	}

	@Test
	void aProviderSignInIsFinishedWithTheCode() throws Exception {
		var user = googleUser("tsp4@example.com", "g-tsp-4");
		var key = turnOn(user);
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, google("g-tsp-4", "tsp4@example.com"));
		var pending = pendingIn(response);

		var signedIn = finish(pending, key).expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(JsonPath.<String>read(signedIn.getResponseBody(), "$.user.email")).isEqualTo("tsp4@example.com");
		assertThat(signedIn.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE))
			.anyMatch(cookie -> cookie.startsWith("refresh_token="));
	}

	@Test
	void theEarlierOutcomesStillComeFirst() throws Exception {
		var user = googleUser("tsp5@example.com", "g-tsp-5");
		turnOn(user);
		var response = new MockHttpServletResponse();

		// Another Google account with the User's email, unverified: it would be linked by email, which needs a verified
		// one.
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response,
				oauth("google", Map.of("sub", "g-tsp-5-other", "email", "tsp5@example.com", "email_verified", false,
						"name", "Someone"), "sub"));

		assertThat(response.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/login?error=email_unverified&provider=google");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
	}

	@Test
	void aUserWithoutTwoStepVerificationSignsInAsBefore() throws Exception {
		googleUser("tsp6@example.com", "g-tsp-6");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, google("g-tsp-6", "tsp6@example.com"));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/auth/callback");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).singleElement()
			.satisfies(cookie -> assertThat(cookie).startsWith("refresh_token="));
	}

	// A provider account Nimbus doesn't know yet, with the User's verified email, would be linked to them. That is a
	// lasting change, so it waits for the code like the Session does.
	@Test
	void aFirstProviderSignInThatLinksByEmailStoresNothingUntilTheCodeIsRight() throws Exception {
		var user = googleUser("tsp8@example.com", "g-tsp-8");
		var key = turnOn(user);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, github("4848", "tsp8@example.com"));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login/two-step");
		assertThat(linkedIdentities.listFor(user.getId())).extracting(LinkedIdentities.LinkedIdentityView::provider)
			.containsExactly("google");

		finish(pendingIn(response), key).expectStatus().isOk();

		assertThat(linkedIdentities.listFor(user.getId())).extracting(LinkedIdentities.LinkedIdentityView::provider)
			.containsExactlyInAnyOrder("google", "github");
	}

	@Test
	void disconnectingTheProviderWhileTheCodePageIsOpenEndsThePendingSignIn() throws Exception {
		var user = googleUser("tsp9@example.com", "g-tsp-9");
		var session = sessions.start(user, null);
		externalSignIn.connect(user.getId(), session.sessionId(),
				new ExternalProfile("github", "4949", "tsp9@example.com", true, "Octo", null, "octo-4949"));
		var key = turnOn(user);
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, github("4949", "tsp9@example.com"));

		client.delete().uri("/api/users/me/linked-identities/github")
			.header("Authorization", "Bearer " + accessTokens.issueFor(user, session.sessionId())).exchange()
			.expectStatus().isNoContent();

		finish(pendingIn(response), key).expectStatus().isUnauthorized().expectBody().jsonPath("$.code")
			.isEqualTo("sign_in_expired");
	}

	// Connecting from the Security page is not a sign-in: the User is signed in already.
	@Test
	void connectingAProviderStillLinksWithoutAsking() throws Exception {
		var user = googleUser("tsp7@example.com", "g-tsp-7");
		turnOn(user);
		var session = sessions.start(user, null);
		var issued = tickets.issue(user.getId(), session.sessionId(), "github");
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(LinkTicket.PARAMETER, issued.ticket());
		LinkTicket.remember(request);
		request.removeParameter(LinkTicket.PARAMETER);
		request.setCookies(new Cookie(LinkTickets.COOKIE, issued.binder()));
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(request, response, github("4343", "tsp7@example.com"));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/settings/security?connected=github");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
		assertThat(linkedIdentities.listFor(user.getId())).hasSize(2);
	}

	private User googleUser(String email, String sub) {
		return externalSignIn.signIn(new ExternalProfile("google", sub, email, true, "Someone", null, email));
	}

	/** Turns on Two-step verification through the Security page's endpoints; returns the authenticator key. */
	private String turnOn(User user) {
		var token = accessTokens.issueFor(user, sessions.start(user, null).sessionId());
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

	private RestTestClient.ResponseSpec finish(String pending, String key) {
		return client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie("two_step_pending", pending).body(Map.of("code", SignInCodes.codeFor(key, clock.instant())))
			.exchange();
	}

	private static String pendingIn(MockHttpServletResponse response) {
		var cookie = response.getHeaders(HttpHeaders.SET_COOKIE).stream()
			.filter(header -> header.startsWith("two_step_pending="))
			.findFirst()
			.orElseThrow(() -> new AssertionError("no two_step_pending cookie was set"));
		return cookie.substring("two_step_pending=".length(), cookie.indexOf(';'));
	}

	// A handshake started from /login?returnTo=<page>, as ReturnPathAuthorizationRequestResolver leaves it.
	private static MockHttpServletRequest startedFrom(String page) {
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(ReturnPath.PARAMETER, page);
		ReturnPath.remember(request);
		request.removeParameter(ReturnPath.PARAMETER);
		return request;
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
