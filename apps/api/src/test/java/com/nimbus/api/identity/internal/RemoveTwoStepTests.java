package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.SignInCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Remove on the Security page: a Sign-in code, or a Recovery code for a User who lost their phone, turns Two-step
 * verification off. Users are made by a Google sign-in, so they are verified from the start; the Google callback goes
 * through {@link OAuthLoginHandler} with mock requests, as in {@code TwoStepProviderSignInTests}.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class RemoveTwoStepTests {

	private static final String PASSWORD = "correct horse";

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
	TwoStepSignIn twoStepSignIn;

	@Autowired
	MovableClock clock;

	@Test
	void aSignInCodeRemovesItAndTheCardSaysOff() {
		var user = twoStepUser("rts1@example.com");

		remove(user.token(), Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()))).expectStatus()
			.isNoContent();

		// The same Session still answers: removing ends no Session.
		status(user.token()).expectStatus().isOk().expectBody().jsonPath("$.enabled").isEqualTo(false)
			.jsonPath("$.recoveryCodesLeft").isEmpty();
	}

	@Test
	void aRecoveryCodeRemovesItWithCapitalsAndSpacesIgnored() {
		var user = twoStepUser("rts2@example.com");
		var typed = " " + user.recoveryCodes().getFirst().toUpperCase().replace("-", " ") + " ";

		remove(user.token(), Map.of("recoveryCode", typed)).expectStatus().isNoContent();

		status(user.token()).expectBody().jsonPath("$.enabled").isEqualTo(false);
	}

	@Test
	void aWrongCodeIsInvalidCodeAndItStaysOn() {
		var user = twoStepUser("rts3@example.com");

		remove(user.token(), Map.of("code", wrongCode(user.key()))).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code");
		remove(user.token(), Map.of("recoveryCode", "aaaa-aaaa")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code");
		remove(user.token(), Map.of()).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("invalid_code");

		status(user.token()).expectBody().jsonPath("$.enabled").isEqualTo(true).jsonPath("$.recoveryCodesLeft")
			.isEqualTo(10);
	}

	@Test
	void wrongCodesCountTowardTheHourlyLock() {
		var user = twoStepUser("rts4@example.com");

		for (var attempt = 0; attempt < 10; attempt++) {
			remove(user.token(), Map.of("code", wrongCode(user.key()))).expectStatus().isBadRequest();
		}

		remove(user.token(), Map.of("recoveryCode", user.recoveryCodes().getFirst())).expectStatus().isEqualTo(429)
			.expectHeader().exists(HttpHeaders.RETRY_AFTER);
		status(user.token()).expectBody().jsonPath("$.enabled").isEqualTo(true);
	}

	@Test
	void aUserWithoutTwoStepVerificationGetsNotOn() {
		var user = googleUser("rts5@example.com");

		remove(tokenFor(user), Map.of("code", "123456")).expectStatus().isEqualTo(409).expectBody().jsonPath("$.code")
			.isEqualTo("not_on");
	}

	@Test
	void aPasswordSignInNoLongerAsksForTheCode() {
		var email = "rts6@example.com";
		String token = JsonPath.read(body(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD)).exchange()
			.expectStatus().isCreated()), "$.accessToken");
		EmailCodes.verify(client, token, email);
		var key = turnOn(token).key();
		var login = Map.of("email", email, "password", PASSWORD);
		client.post().uri("/api/auth/login").body(login).exchange().expectBody().jsonPath("$.twoStepRequired")
			.isEqualTo(true);

		remove(token, Map.of("code", SignInCodes.codeFor(key, clock.instant()))).expectStatus().isNoContent();

		client.post().uri("/api/auth/login").body(login).exchange().expectStatus().isOk().expectBody()
			.jsonPath("$.accessToken").isNotEmpty().jsonPath("$.twoStepRequired").doesNotExist();
	}

	@Test
	void aGoogleSignInNoLongerAsksForTheCode() throws Exception {
		var user = twoStepUser("rts7@example.com");

		remove(user.token(), Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()))).expectStatus()
			.isNoContent();

		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, google("rts7@example.com"));
		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/auth/callback");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).singleElement()
			.satisfies(cookie -> assertThat(cookie).startsWith("refresh_token="));
	}

	@Test
	void settingUpAgainGivesANewKeyAndNewCodes() {
		var user = twoStepUser("rts8@example.com");
		remove(user.token(), Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()))).expectStatus()
			.isNoContent();

		var again = turnOn(user.token());

		assertThat(again.key()).isNotEqualTo(user.key());
		assertThat(again.recoveryCodes()).hasSize(10).doesNotContainAnyElementsOf(user.recoveryCodes());
		status(user.token()).expectBody().jsonPath("$.enabled").isEqualTo(true);
	}

	@Test
	void aSignInWaitingForItsCodeEndsAndDoesNotTakeTheNextSetupsCode() {
		var user = twoStepUser("rts11@example.com");
		var waiting = twoStepSignIn.begin(user.user()).orElseThrow();
		remove(user.token(), Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()))).expectStatus()
			.isNoContent();
		var again = turnOn(user.token());

		client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie(waiting.getName(), waiting.getValue())
			.body(Map.of("code", SignInCodes.codeFor(again.key(), clock.instant()))).exchange().expectStatus()
			.isUnauthorized().expectBody().jsonPath("$.code").isEqualTo("sign_in_expired");
	}

	@Test
	void anEndedSessionIs401AndAnUnverifiedUserIs403() {
		var user = googleUser("rts9@example.com");
		var token = accessTokens.issueFor(user, sessions.start(user, null).sessionId());
		sessions.endAll(user);
		remove(token, Map.of("code", "123456")).expectStatus().isUnauthorized();

		String unverified = JsonPath.read(body(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Hopper", "email", "rts10@example.com", "password", PASSWORD)).exchange()
			.expectStatus().isCreated()), "$.accessToken");
		remove(unverified, Map.of("code", "123456")).expectStatus().isForbidden().expectBody().jsonPath("$.code")
			.isEqualTo("email_unverified");
	}

	private TwoStepUser twoStepUser(String email) {
		var user = googleUser(email);
		var token = tokenFor(user);
		var setUp = turnOn(token);
		return new TwoStepUser(user, token, setUp.key(), setUp.recoveryCodes());
	}

	/** Sets Two-step verification up for the token's User and turns it on. */
	private SetUp turnOn(String token) {
		String key = JsonPath.read(body(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange().expectStatus().isOk()), "$.key");
		List<String> codes = JsonPath.read(body(client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk()),
				"$.recoveryCodes");
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		// The code that proved the key counts as used, so the next check needs the next one.
		clock.advance(Duration.ofSeconds(30));
		return new SetUp(key, codes);
	}

	private User googleUser(String email) {
		return externalSignIn.signIn(new ExternalProfile("google", "g-" + email, email, true, "Someone", null, email));
	}

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user, null).sessionId());
	}

	private RestTestClient.ResponseSpec remove(String token, Map<String, String> body) {
		return client.method(HttpMethod.DELETE).uri("/api/users/me/two-step").header("Authorization", "Bearer " + token)
			.body(body).exchange();
	}

	private RestTestClient.ResponseSpec status(String token) {
		return client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange();
	}

	/** A code that fits no step within a minute of now. */
	private String wrongCode(String key) {
		var near = Stream.of(-30, 0, 30)
			.map(seconds -> SignInCodes.codeFor(key, clock.instant().plusSeconds(seconds)))
			.toList();
		return Stream.of("999999", "999998", "999997").filter(code -> !near.contains(code)).findFirst().orElseThrow();
	}

	private static String body(RestTestClient.ResponseSpec response) {
		return response.expectBody(String.class).returnResult().getResponseBody();
	}

	private static OAuth2AuthenticationToken google(String email) {
		var attributes = Map.<String, Object>of("sub", "g-" + email, "email", email, "email_verified", true, "name",
				"Someone");
		var user = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"), attributes, "sub");
		return new OAuth2AuthenticationToken(user, List.of(), "google");
	}

	private record SetUp(String key, List<String> recoveryCodes) {
	}

	private record TwoStepUser(User user, String token, String key, List<String> recoveryCodes) {
	}

}
