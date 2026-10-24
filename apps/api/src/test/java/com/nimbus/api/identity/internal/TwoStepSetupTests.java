package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
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
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Turning on Two-step verification from the Security page: scan the key, prove it with a Sign-in code, save the
 * Recovery codes, turn it on. Users are made by a Google sign-in, so they are verified from the start.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class TwoStepSetupTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	MovableClock clock;

	@Test
	void aUserTurnsItOnWithACodeFromTheirAppAndGetsTenRecoveryCodes() {
		var token = tokenFor("ts1@example.com");
		status(token).expectStatus().isOk().expectBody()
			.jsonPath("$.enabled").isEqualTo(false)
			.jsonPath("$.enabledAt").isEmpty()
			.jsonPath("$.recoveryCodesLeft").isEmpty();

		var setup = body(post(token, "/setup", null).expectStatus().isOk());
		String key = JsonPath.read(setup, "$.key");
		String uri = JsonPath.read(setup, "$.otpauthUri");
		assertThat(key.replace(" ", "")).hasSize(32).matches("[A-Z2-7]+");
		assertThat(uri).isEqualTo("otpauth://totp/Nimbus:ts1%40example.com?secret=" + key.replace(" ", "")
				+ "&issuer=Nimbus");

		var verified = body(post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant())))
			.expectStatus().isOk());
		List<String> codes = JsonPath.read(verified, "$.recoveryCodes");
		assertThat(codes).hasSize(10).doesNotHaveDuplicates().allMatch(code -> code.matches("[a-z0-9]{4}-[a-z0-9]{4}"));

		post(token, "", null).expectStatus().isNoContent();

		status(token).expectStatus().isOk().expectBody()
			.jsonPath("$.enabled").isEqualTo(true)
			.jsonPath("$.enabledAt").isNotEmpty()
			.jsonPath("$.recoveryCodesLeft").isEqualTo(10);
	}

	@Test
	void aWrongCodeIsRefusedAndTheUserCanTryAgain() {
		var token = tokenFor("ts2@example.com");
		var key = startSetup(token);
		var right = SignInCodes.codeFor(key, clock.instant());
		var wrong = right.equals("000000") ? "000001" : "000000";

		post(token, "/setup/verify", Map.of("code", wrong)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code");
		post(token, "/setup/verify", Map.of("code", "not a code")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code");

		post(token, "/setup/verify", Map.of("code", right)).expectStatus().isOk();
	}

	@Test
	void aCodeFromOneStepEarlierWorksButNotFromTwoStepsAway() {
		var token = tokenFor("ts3@example.com");
		var key = startSetup(token);

		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant().plusSeconds(60))))
			.expectStatus().isBadRequest();
		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant().minusSeconds(60))))
			.expectStatus().isBadRequest();
		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant().minusSeconds(30))))
			.expectStatus().isOk();
	}

	@Test
	void turningOnBeforeACodeProvedTheKeyDoesNothing() {
		var token = tokenFor("ts4@example.com");
		startSetup(token);

		post(token, "", null).expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("setup_expired");

		status(token).expectStatus().isOk().expectBody().jsonPath("$.enabled").isEqualTo(false);
	}

	@Test
	void aSetupLastsTenMinutes() {
		var token = tokenFor("ts5@example.com");
		var key = startSetup(token);

		clock.advance(Duration.ofMinutes(10).plusSeconds(1));

		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant()))).expectStatus()
			.isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("setup_expired");
	}

	@Test
	void startingAgainThrowsTheFirstKeyAway() {
		var token = tokenFor("ts6@example.com");
		var first = startSetup(token);
		var second = startSetup(token);
		assertThat(second).isNotEqualTo(first);

		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(first, clock.instant()))).expectStatus()
			.isBadRequest();
		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(second, clock.instant()))).expectStatus()
			.isOk();
	}

	@Test
	void aUserWhoHasItOnAlreadyGets409() {
		var token = tokenFor("ts7@example.com");
		turnOn(token);

		post(token, "/setup", null).expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("already_on");
		post(token, "", null).expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("already_on");

		// Checked before the recent sign-in, so nobody is asked to sign in again for something that would fail.
		clock.advance(Duration.ofMinutes(11));
		post(token, "/setup", null).expectStatus().isEqualTo(409);
	}

	@Test
	void aSessionStartedMoreThanTenMinutesAgoMustSignInAgain() {
		var token = tokenFor("ts8@example.com");

		clock.advance(Duration.ofMinutes(11));

		post(token, "/setup", null).expectStatus().isForbidden().expectBody().jsonPath("$.code")
			.isEqualTo("reauth_required");
	}

	@Test
	void anEndedSessionIs401() {
		var user = userFor("ts9@example.com");
		var token = accessTokens.issueFor(user, sessions.start(user, null).sessionId());
		sessions.endAll(user);

		status(token).expectStatus().isUnauthorized();
		post(token, "/setup", null).expectStatus().isUnauthorized();
		post(token, "/setup/verify", Map.of("code", "123456")).expectStatus().isUnauthorized();
		post(token, "", null).expectStatus().isUnauthorized();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Hopper", "email", "ts10@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");

		status(token).expectStatus().isForbidden().expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		post(token, "/setup", null).expectStatus().isForbidden();
	}

	@Test
	void needsASignedInUser() {
		client.get().uri("/api/users/me/two-step").exchange().expectStatus().isUnauthorized();
	}

	private void turnOn(String token) {
		var key = startSetup(token);
		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant()))).expectStatus().isOk();
		post(token, "", null).expectStatus().isNoContent();
	}

	private String startSetup(String token) {
		return JsonPath.read(body(post(token, "/setup", null).expectStatus().isOk()), "$.key");
	}

	private User userFor(String email) {
		return externalSignIn.signIn(new ExternalProfile("google", "g-" + email, email, true, "Someone", null, email));
	}

	private String tokenFor(String email) {
		var user = userFor(email);
		return accessTokens.issueFor(user, sessions.start(user, null).sessionId());
	}

	private RestTestClient.ResponseSpec status(String token) {
		return client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange();
	}

	private RestTestClient.ResponseSpec post(String token, String path, Object body) {
		var request = client.post().uri("/api/users/me/two-step" + path).header("Authorization", "Bearer " + token);
		return (body == null ? request : request.body(body)).exchange();
	}

	private static String body(RestTestClient.ResponseSpec response) {
		return response.expectBody(String.class).returnResult().getResponseBody();
	}

}
