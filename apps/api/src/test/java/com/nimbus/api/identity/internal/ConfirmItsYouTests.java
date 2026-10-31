package com.nimbus.api.identity.internal;

import java.time.Duration;
import java.util.List;
import java.util.Map;

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
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * "Confirm it's you" before changing the email: a User whose sign-in is more than 10 minutes old gives their password,
 * and their Sign-in code or a Recovery code when they have Two-step verification, instead of signing in again.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ConfirmItsYouTests {

	private static final String PASSWORD = "correct horse";

	private static final Duration PAST_RECENT = Duration.ofMinutes(10).plusSeconds(1);

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Test
	void thePasswordLetsAnOldSignInChangeTheEmailForTenMinutes() {
		var token = verifiedUser("cy1@example.com");
		clock.advance(PAST_RECENT);
		requestChange(token, "cy1-new@example.com").expectStatus().isForbidden().expectBody()
			.jsonPath("$.code").isEqualTo("reauth_required");

		confirm(token, Map.of("password", PASSWORD)).expectStatus().isNoContent();
		requestChange(token, "cy1-new@example.com").expectStatus().isNoContent();

		clock.advance(PAST_RECENT);
		requestChange(token, "cy1-other@example.com").expectStatus().isForbidden().expectBody()
			.jsonPath("$.code").isEqualTo("reauth_required");
	}

	@Test
	void aWrongOrMissingPasswordIsRefusedUnderPassword() {
		var token = verifiedUser("cy2@example.com");

		confirm(token, Map.of("password", "not it")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.password").isNotEmpty();
		confirm(token, Map.of()).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.password").isNotEmpty();
	}

	@Test
	void wrongPasswordsCountTowardTheSameLimitAsChangingThePassword() {
		var token = verifiedUser("cy3@example.com");
		for (var i = 0; i < 5; i++) {
			confirm(token, Map.of("password", "not it")).expectStatus().isBadRequest();
		}

		confirm(token, Map.of("password", PASSWORD)).expectStatus().isEqualTo(429)
			.expectHeader().exists("Retry-After");
		client.put().uri("/api/users/me/password").header("Authorization", "Bearer " + token)
			.body(Map.of("currentPassword", PASSWORD, "newPassword", "another one"))
			.exchange().expectStatus().isEqualTo(429);
	}

	@Test
	void withTwoStepVerificationTheSignInCodeIsAskedAfterThePassword() {
		var token = verifiedUser("cy4@example.com");
		var key = turnOnTwoStep(token).key();
		clock.advance(PAST_RECENT);

		// A wrong password says nothing about Two-step verification.
		confirm(token, Map.of("password", "not it")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.password").isNotEmpty()
			.jsonPath("$.code").doesNotExist();
		confirm(token, Map.of("password", PASSWORD)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("two_step_required");
		var right = SignInCodes.codeFor(key, clock.instant());
		var wrong = right.equals("000000") ? "000001" : "000000";
		confirm(token, Map.of("password", PASSWORD, "twoStepCode", wrong)).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("invalid_two_step_code");
		requestChange(token, "cy4-new@example.com").expectStatus().isForbidden();

		confirm(token, Map.of("password", PASSWORD, "twoStepCode", right)).expectStatus().isNoContent();
		requestChange(token, "cy4-new@example.com").expectStatus().isNoContent();
		// No reuse, as at sign-in.
		confirm(token, Map.of("password", PASSWORD, "twoStepCode", right)).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("invalid_two_step_code");
	}

	@Test
	void aRecoveryCodeWorksOnceInsteadOfTheSignInCode() {
		var token = verifiedUser("cy5@example.com");
		var recovery = turnOnTwoStep(token).recoveryCodes().get(0);
		clock.advance(PAST_RECENT);

		confirm(token, Map.of("password", PASSWORD, "recoveryCode", recovery)).expectStatus().isNoContent();
		confirm(token, Map.of("password", PASSWORD, "recoveryCode", recovery)).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("invalid_two_step_code");
		twoStepStatus(token).expectBody().jsonPath("$.recoveryCodesLeft").isEqualTo(9);
	}

	@Test
	void aUserWithoutAPasswordIsToldToSignInAgain() {
		var user = externalSignIn
			.signIn(new ExternalProfile("google", "g-cy6", "cy6@example.com", true, "Someone", null, "cy6@example.com"));
		var token = accessTokens.issueFor(user, sessions.start(user, null, false).sessionId());

		confirm(token, Map.of("password", "anything")).expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("no_password");
	}

	@Test
	void connectingAProviderStillNeedsARecentSignIn() {
		var token = verifiedUser("cy7@example.com");
		clock.advance(PAST_RECENT);

		confirm(token, Map.of("password", PASSWORD)).expectStatus().isNoContent();

		client.post().uri("/api/users/me/linked-identities/github/link-ticket")
			.header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isForbidden().expectBody().jsonPath("$.code").isEqualTo("reauth_required");
	}

	@Test
	void anUnverifiedUserOrAnEndedSessionCantConfirm() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "cy8@example.com", "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult();
		String unverified = JsonPath.read(response.getResponseBody(), "$.accessToken");
		confirm(unverified, Map.of("password", PASSWORD)).expectStatus().isForbidden().expectBody()
			.jsonPath("$.code").isEqualTo("email_unverified");

		var user = externalSignIn
			.signIn(new ExternalProfile("google", "g-cy9", "cy9@example.com", true, "Someone", null, "cy9@example.com"));
		var started = sessions.start(user, null, false);
		var token = accessTokens.issueFor(user, started.sessionId());
		sessions.endAll(user);
		confirm(token, Map.of("password", PASSWORD)).expectStatus().isUnauthorized();
	}

	/** Registers and verifies a User and returns their access token; the sign-in is brand new. */
	private String verifiedUser(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

	private record TwoStepOn(String key, List<String> recoveryCodes) {
	}

	private TwoStepOn turnOnTwoStep(String token) {
		var setup = client.post().uri("/api/users/me/two-step/setup").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		String key = JsonPath.read(setup, "$.key");
		var verified = client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant())))
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isNoContent();
		return new TwoStepOn(key, JsonPath.read(verified, "$.recoveryCodes"));
	}

	private RestTestClient.ResponseSpec twoStepStatus(String token) {
		return client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange();
	}

	private RestTestClient.ResponseSpec confirm(String token, Map<String, String> body) {
		return client.post().uri("/api/users/me/confirm").header("Authorization", "Bearer " + token)
			.body(body)
			.exchange();
	}

	private RestTestClient.ResponseSpec requestChange(String token, String email) {
		return client.post().uri("/api/users/me/email-change").header("Authorization", "Bearer " + token)
			.body(Map.of("email", email))
			.exchange();
	}

}
