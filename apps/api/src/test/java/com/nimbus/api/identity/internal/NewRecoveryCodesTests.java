package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.RecoveryCodesRegenerated;
import com.nimbus.api.identity.SignInCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * View new codes on the Security page: a Sign-in code from the User's app replaces the set of Recovery codes, and the
 * old set stops working at once. Users are made by a Google sign-in, so they are verified from the start; signing in
 * with a Recovery code goes through a Google sign-in, which with Two-step verification on also asks for a code.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, NewRecoveryCodesTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class NewRecoveryCodesTests {

	@Autowired
	RestTestClient client;

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

	@Autowired
	Listener listener;

	@Test
	void newCodesSignInAndTheOldOnesAreRefused() {
		var user = twoStepUser("nrc1@example.com");

		var fresh = newCodes(user.token(), SignInCodes.codeFor(user.key(), clock.instant())).expectStatus().isOk();
		List<String> codes = JsonPath.read(body(fresh), "$.recoveryCodes");

		assertThat(codes).hasSize(10).doesNotHaveDuplicates().doesNotContainAnyElementsOf(user.recoveryCodes())
			.allMatch(code -> code.matches("[a-z0-9]{4}-[a-z0-9]{4}"));
		recoveryCode(user, user.recoveryCodes().getFirst()).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code");
		recoveryCode(user, codes.getFirst()).expectStatus().isOk();
	}

	@Test
	void theCountIsBackToTen() {
		var user = twoStepUser("nrc2@example.com");
		recoveryCode(user, user.recoveryCodes().getFirst()).expectStatus().isOk();
		status(user.token()).expectBody().jsonPath("$.recoveryCodesLeft").isEqualTo(9);

		newCodes(user.token(), SignInCodes.codeFor(user.key(), clock.instant())).expectStatus().isOk();

		status(user.token()).expectBody().jsonPath("$.recoveryCodesLeft").isEqualTo(10);
	}

	@Test
	void aRecoveryCodeIsNotACodeHere() {
		var user = twoStepUser("nrc3@example.com");

		newCodes(user.token(), user.recoveryCodes().getFirst()).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code");
		client.post().uri("/api/users/me/two-step/recovery-codes").header("Authorization", "Bearer " + user.token())
			.body(Map.of("recoveryCode", user.recoveryCodes().getFirst())).exchange().expectStatus().isBadRequest();
	}

	@Test
	void aCodeIsAcceptedOnceAndWithOneStepOfDrift() {
		var user = twoStepUser("nrc4@example.com");
		var code = SignInCodes.codeFor(user.key(), clock.instant().minusSeconds(30 * 2));

		newCodes(user.token(), code).expectStatus().isBadRequest();
		var right = SignInCodes.codeFor(user.key(), clock.instant().plusSeconds(30));
		newCodes(user.token(), right).expectStatus().isOk();
		newCodes(user.token(), right).expectStatus().isBadRequest();
	}

	@Test
	void wrongCodesCountTowardTheHourlyLock() {
		var user = twoStepUser("nrc5@example.com");
		var wrong = SignInCodes.codeFor(user.key(), clock.instant()).equals("000000") ? "000001" : "000000";

		for (var attempt = 0; attempt < 10; attempt++) {
			newCodes(user.token(), wrong).expectStatus().isBadRequest();
		}

		newCodes(user.token(), SignInCodes.codeFor(user.key(), clock.instant())).expectStatus().isEqualTo(429)
			.expectHeader().exists(HttpHeaders.RETRY_AFTER);
	}

	@Test
	void aUserWithoutTwoStepVerificationGetsNotOn() {
		var user = googleUser("nrc6@example.com");

		newCodes(tokenFor(user), "123456").expectStatus().isEqualTo(409).expectBody().jsonPath("$.code")
			.isEqualTo("not_on");
	}

	@Test
	void anEndedSessionIs401AndAnUnverifiedUserIs403() {
		var user = googleUser("nrc7@example.com");
		var token = accessTokens.issueFor(user, sessions.start(user, null).sessionId());
		sessions.endAll(user);
		newCodes(token, "123456").expectStatus().isUnauthorized();

		String unverified = JsonPath.read(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Hopper", "email", "nrc8@example.com", "password", "correct horse")).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");
		newCodes(unverified, "123456").expectStatus().isForbidden().expectBody().jsonPath("$.code")
			.isEqualTo("email_unverified");
	}

	@Test
	void newCodesPublishRecoveryCodesRegeneratedOnceWithNoCode() {
		var user = twoStepUser("nrc9@example.com");
		var userId = user.user().getId().toString();

		newCodes(user.token(), "not a code").expectStatus().isBadRequest();
		assertThat(listener.about(userId)).isEmpty();
		List<String> codes = JsonPath.read(body(newCodes(user.token(),
				SignInCodes.codeFor(user.key(), clock.instant())).expectStatus().isOk()), "$.recoveryCodes");

		var published = listener.about(userId);
		assertThat(published).hasSize(1);
		assertThat(published.getFirst().occurredAt()).isNotNull();
		assertThat(published.getFirst().toString()).doesNotContain(codes.getFirst());
	}

	private TwoStepUser twoStepUser(String email) {
		var user = googleUser(email);
		var token = tokenFor(user);
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
		return new TwoStepUser(user, token, key, codes);
	}

	private User googleUser(String email) {
		return externalSignIn.signIn(new ExternalProfile("google", "g-" + email, email, true, "Someone", null, email));
	}

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user, null).sessionId());
	}

	/** A Google sign-in by the User, finished with a Recovery code. */
	private RestTestClient.ResponseSpec recoveryCode(TwoStepUser user, String code) {
		var cookie = twoStepSignIn.begin(user.user(), null, null).orElseThrow();
		return client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie(cookie.getName(), cookie.getValue()).body(Map.of("recoveryCode", code)).exchange();
	}

	private RestTestClient.ResponseSpec newCodes(String token, String code) {
		return client.post().uri("/api/users/me/two-step/recovery-codes").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code)).exchange();
	}

	private RestTestClient.ResponseSpec status(String token) {
		return client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange();
	}

	private static String body(RestTestClient.ResponseSpec response) {
		return response.expectBody(String.class).returnResult().getResponseBody();
	}

	private record TwoStepUser(User user, String token, String key, List<String> recoveryCodes) {
	}

	@TestConfiguration
	static class Listener {

		private final List<RecoveryCodesRegenerated> received = new CopyOnWriteArrayList<>();

		@EventListener
		void on(RecoveryCodesRegenerated event) {
			received.add(event);
		}

		List<RecoveryCodesRegenerated> about(String userId) {
			return received.stream().filter(event -> event.userId().toString().equals(userId)).toList();
		}

	}

}
