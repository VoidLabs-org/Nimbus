package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.HttpCookie;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Signing in with a password when Two-step verification is on: the password alone starts no Session, and a Sign-in
 * code from the User's app finishes the sign-in.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class TwoStepSignInTests {

	private static final String PASSWORD = "correct horse";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void theRightPasswordAsksForTheCodeAndStartsNoSession() {
		twoStepUser("tsi1@example.com");

		var result = login("tsi1@example.com").expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(JsonPath.<Boolean>read(result.getResponseBody(), "$.twoStepRequired")).isTrue();
		assertThat(JsonPath.<Map<String, Object>>read(result.getResponseBody(), "$")).doesNotContainKey("accessToken");
		assertThat(cookieNames(result)).doesNotContain("refresh_token");
		var pending = cookie(result, "two_step_pending");
		var header = setCookieHeader(result, "two_step_pending");
		assertThat(pending.getValue()).hasSizeGreaterThanOrEqualTo(40);
		assertThat(pending.getPath()).isEqualTo("/api/auth/two-step");
		assertThat(header).contains("Max-Age=300").contains("HttpOnly").contains("Secure").contains("SameSite=Strict");
	}

	@Test
	void theRightCodeSignsInAndClearsThePendingSignIn() {
		var key = twoStepUser("tsi2@example.com");
		var pending = pendingSignIn("tsi2@example.com");

		var result = twoStep(pending, SignInCodes.codeFor(key, clock.instant()),
				SessionListTests.FIREFOX_ON_LINUX).expectStatus()
			.isOk().expectBody(String.class).returnResult();

		String accessToken = JsonPath.read(result.getResponseBody(), "$.accessToken");
		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.user.email")).isEqualTo("tsi2@example.com");
		assertThat(RefreshCookies.valueOf(result)).isNotEmpty();
		assertThat(setCookieHeader(result, "two_step_pending")).contains("Max-Age=0");
		client.get().uri("/api/users/me/sessions").header("Authorization", "Bearer " + accessToken).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$[*].device").value(devices -> assertThat(devices.toString())
				.contains("Firefox on Linux"));

		// Single use: the same pending sign-in can't start a second Session.
		clock.advance(Duration.ofSeconds(30));
		twoStep(pending, SignInCodes.codeFor(key, clock.instant())).expectStatus().isUnauthorized().expectBody()
			.jsonPath("$.code").isEqualTo("sign_in_expired");
	}

	@Test
	void aWrongCodeSaysHowManyTriesAreLeft() {
		var key = twoStepUser("tsi3@example.com");
		var pending = pendingSignIn("tsi3@example.com");
		var wrong = wrongCode(key);

		twoStep(pending, wrong).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code")
			.jsonPath("$.triesLeft").isEqualTo(4);
		twoStep(pending, "not a code").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.triesLeft").isEqualTo(3);

		twoStep(pending, SignInCodes.codeFor(key, clock.instant())).expectStatus().isOk();
	}

	@Test
	void theFifthWrongCodeEndsThePendingSignIn() {
		var key = twoStepUser("tsi4@example.com");
		var pending = pendingSignIn("tsi4@example.com");
		var wrong = wrongCode(key);

		for (var attempt = 0; attempt < 4; attempt++) {
			twoStep(pending, wrong).expectStatus().isBadRequest();
		}
		var fifth = twoStep(pending, wrong).expectStatus().isUnauthorized().expectBody(String.class).returnResult();
		assertThat(JsonPath.<String>read(fifth.getResponseBody(), "$.code")).isEqualTo("sign_in_expired");
		assertThat(setCookieHeader(fifth, "two_step_pending")).contains("Max-Age=0");

		twoStep(pending, SignInCodes.codeFor(key, clock.instant())).expectStatus().isUnauthorized();
	}

	@Test
	void aPendingSignInLastsFiveMinutes() {
		var key = twoStepUser("tsi5@example.com");
		var pending = pendingSignIn("tsi5@example.com");

		clock.advance(Duration.ofMinutes(5).plusSeconds(1));

		var result = twoStep(pending, SignInCodes.codeFor(key, clock.instant())).expectStatus().isUnauthorized()
			.expectBody(String.class).returnResult();
		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.code")).isEqualTo("sign_in_expired");
		assertThat(setCookieHeader(result, "two_step_pending")).contains("Max-Age=0");
	}

	@Test
	void aMissingOrUnknownPendingSignInHasExpired() {
		var key = twoStepUser("tsi6@example.com");
		var code = SignInCodes.codeFor(key, clock.instant());

		twoStep(null, code).expectStatus().isUnauthorized().expectBody().jsonPath("$.code")
			.isEqualTo("sign_in_expired");
		twoStep("made-up", code).expectStatus().isUnauthorized().expectBody().jsonPath("$.code")
			.isEqualTo("sign_in_expired");
	}

	@Test
	void codesFromOneStepBeforeOrAfterNowWorkButNotTwo() {
		var key = twoStepUser("tsi7@example.com");
		// One step on, so the step before now is not the one that proved the key during setup.
		clock.advance(Duration.ofSeconds(30));

		var pending = pendingSignIn("tsi7@example.com");
		twoStep(pending, SignInCodes.codeFor(key, clock.instant().plusSeconds(60))).expectStatus().isBadRequest();
		twoStep(pending, SignInCodes.codeFor(key, clock.instant().minusSeconds(60))).expectStatus().isBadRequest();
		twoStep(pending, SignInCodes.codeFor(key, clock.instant().minusSeconds(30))).expectStatus().isOk();

		twoStep(pendingSignIn("tsi7@example.com"), SignInCodes.codeFor(key, clock.instant().plusSeconds(30)))
			.expectStatus().isOk();
	}

	@Test
	void aCodeThatSignedInAlreadyOrAnOlderOneIsRefused() {
		var key = twoStepUser("tsi8@example.com");
		var now = SignInCodes.codeFor(key, clock.instant());
		var next = SignInCodes.codeFor(key, clock.instant().plusSeconds(30));

		twoStep(pendingSignIn("tsi8@example.com"), next).expectStatus().isOk();

		var pending = pendingSignIn("tsi8@example.com");
		twoStep(pending, next).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("invalid_code");
		twoStep(pending, now).expectStatus().isBadRequest();
	}

	@Test
	void tenWrongCodesInAnHourLockTheUserAcrossNewSignIns() {
		var key = twoStepUser("tsi9@example.com");
		var wrong = wrongCode(key);

		for (var round = 0; round < 2; round++) {
			var pending = pendingSignIn("tsi9@example.com");
			for (var attempt = 0; attempt < 4; attempt++) {
				twoStep(pending, wrong).expectStatus().isBadRequest();
			}
			twoStep(pending, wrong).expectStatus().isUnauthorized();
		}

		clock.advance(Duration.ofMinutes(30));
		var locked = twoStep(pendingSignIn("tsi9@example.com"), SignInCodes.codeFor(key, clock.instant()))
			.expectStatus().isEqualTo(429).expectBody(String.class).returnResult();
		var retryAfter = Long.parseLong(locked.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER));
		assertThat(retryAfter).isBetween(1L, Duration.ofMinutes(30).toSeconds());

		clock.advance(Duration.ofMinutes(31));
		twoStep(pendingSignIn("tsi9@example.com"), SignInCodes.codeFor(key, clock.instant())).expectStatus().isOk();
	}

	@Test
	void theCodeCheckNeedsTheNimbusHeader() {
		var key = twoStepUser("tsi10@example.com");
		var pending = pendingSignIn("tsi10@example.com");

		client.post().uri("/api/auth/two-step").cookie("two_step_pending", pending)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange()
			.expectStatus().isForbidden();

		twoStep(pending, SignInCodes.codeFor(key, clock.instant())).expectStatus().isOk();
	}

	@Test
	void aUserWithoutTwoStepVerificationSignsInAsBefore() {
		register("tsi11@example.com");

		var result = login("tsi11@example.com").expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.accessToken")).isNotEmpty();
		assertThat(RefreshCookies.valueOf(result)).isNotEmpty();
		assertThat(cookieNames(result)).doesNotContain("two_step_pending");
		assertThat(JsonPath.<Map<String, Object>>read(result.getResponseBody(), "$")).doesNotContainKey("twoStepRequired");
	}

	@Test
	void aRefreshNeverAsksForTheCode() {
		var key = twoStepUser("tsi12@example.com");
		var signedIn = twoStep(pendingSignIn("tsi12@example.com"), SignInCodes.codeFor(key, clock.instant()))
			.expectStatus().isOk().expectBody(String.class).returnResult();

		client.post().uri("/api/auth/refresh").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", RefreshCookies.valueOf(signedIn)).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$.accessToken").isNotEmpty();
	}

	@Test
	void aWrongPasswordIsStillJustAWrongPassword() {
		twoStepUser("tsi13@example.com");

		var result = client.post().uri("/api/auth/login")
			.body(Map.of("email", "tsi13@example.com", "password", "wrong horse")).exchange()
			.expectStatus().isUnauthorized().expectBody(String.class).returnResult();
		assertThat(cookieNames(result)).doesNotContain("two_step_pending");
	}

	@Test
	void aPasswordChangeEndsSignInsTheOldPasswordStarted() {
		var key = twoStepUser("tsi14@example.com");
		var startedWithOld = pendingSignIn("tsi14@example.com");
		String token = JsonPath.read(twoStep(pendingSignIn("tsi14@example.com"), SignInCodes.codeFor(key, clock.instant()))
			.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");

		client.put().uri("/api/users/me/password").header("Authorization", "Bearer " + token)
			.body(Map.of("currentPassword", PASSWORD, "newPassword", "battery staple")).exchange()
			.expectStatus().isNoContent();

		clock.advance(Duration.ofSeconds(30));
		twoStep(startedWithOld, SignInCodes.codeFor(key, clock.instant())).expectStatus().isUnauthorized()
			.expectBody().jsonPath("$.code").isEqualTo("sign_in_expired");
	}

	@Test
	void aUserHoldsAtMostThreePendingSignIns() {
		var key = twoStepUser("tsi15@example.com");
		var oldest = pendingSignIn("tsi15@example.com");
		var kept = pendingSignIn("tsi15@example.com");
		pendingSignIn("tsi15@example.com");
		pendingSignIn("tsi15@example.com");

		twoStep(oldest, SignInCodes.codeFor(key, clock.instant())).expectStatus().isUnauthorized();
		twoStep(kept, SignInCodes.codeFor(key, clock.instant())).expectStatus().isOk();
	}

	/** Registers a verified User with Two-step verification on, and returns their authenticator key. */
	private String twoStepUser(String email) {
		var token = register(email);
		EmailCodes.verify(client, token, email);
		String key = JsonPath.read(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.key");
		client.post().uri("/api/users/me/two-step/setup/verify").header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk();
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		// The code that proved the key counts as used, so the next sign-in needs the next one.
		clock.advance(Duration.ofSeconds(30));
		return key;
	}

	private String register(String email) {
		return JsonPath.read(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD)).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");
	}

	private RestTestClient.ResponseSpec login(String email) {
		return client.post().uri("/api/auth/login").body(Map.of("email", email, "password", PASSWORD)).exchange();
	}

	private String pendingSignIn(String email) {
		return cookie(login(email).expectStatus().isOk().expectBody(String.class).returnResult(), "two_step_pending")
			.getValue();
	}

	private RestTestClient.ResponseSpec twoStep(String pending, String code) {
		return twoStep(pending, code, null);
	}

	private RestTestClient.ResponseSpec twoStep(String pending, String code, String userAgent) {
		var request = client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.body(Map.of("code", code));
		if (pending != null) {
			request = request.cookie("two_step_pending", pending);
		}
		if (userAgent != null) {
			request = request.header(HttpHeaders.USER_AGENT, userAgent);
		}
		return request.exchange();
	}

	/** A code that fits no step within a minute of now. */
	private String wrongCode(String key) {
		var near = Stream.of(-30, 0, 30)
			.map(seconds -> SignInCodes.codeFor(key, clock.instant().plusSeconds(seconds)))
			.toList();
		return Stream.of("999999", "999998", "999997").filter(code -> !near.contains(code))
			.findFirst().orElseThrow();
	}

	private static List<String> cookieNames(EntityExchangeResult<?> result) {
		return result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.map(header -> header.substring(0, header.indexOf('=')))
			.toList();
	}

	private static HttpCookie cookie(EntityExchangeResult<?> result, String name) {
		return HttpCookie.parse(setCookieHeader(result, name)).getFirst();
	}

	private static String setCookieHeader(EntityExchangeResult<?> result, String name) {
		return result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(header -> header.startsWith(name + "="))
			.findFirst()
			.orElseThrow(() -> new AssertionError("no " + name + " cookie was set"));
	}

}
