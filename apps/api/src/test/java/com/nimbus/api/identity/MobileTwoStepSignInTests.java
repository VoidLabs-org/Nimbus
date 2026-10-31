package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.HashMap;
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
 * Two-step sign-in from the Mobile app (ADR 0010): with {@code X-Nimbus-Client: mobile} the pending sign-in and the
 * remembered device travel in the body as {@code pendingToken} and {@code rememberedToken}, never in cookies. The rules
 * are the browser's, which {@link TwoStepSignInTests} covers in full.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class MobileTwoStepSignInTests {

	private static final String PASSWORD = "correct horse";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void theRightPasswordAnswersThePendingTokenInTheBodyAndSetsNoCookie() {
		twoStepUser("mts1@example.com");

		var phone = login("mts1@example.com", null).expectStatus().isOk().expectBody(String.class).returnResult();
		var browser = client.post().uri("/api/auth/login")
			.body(Map.of("email", "mts1@example.com", "password", PASSWORD))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();

		assertThat(JsonPath.<Boolean>read(phone.getResponseBody(), "$.twoStepRequired")).isTrue();
		assertThat(JsonPath.<String>read(phone.getResponseBody(), "$.pendingToken")).hasSizeGreaterThanOrEqualTo(40);
		assertThat(cookieNames(phone)).isEmpty();
		assertThat(cookieNames(browser)).contains("two_step_pending");
		assertThat(browser.getResponseBody()).doesNotContain("pendingToken");
	}

	@Test
	void theRightCodeWithThePendingTokenSignsInWithNoCookies() {
		var key = twoStepUser("mts2@example.com");
		var pending = pendingToken("mts2@example.com", null);

		var result = twoStep(Map.of("pendingToken", pending, "code", SignInCodes.codeFor(key, clock.instant())))
			.expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(cookieNames(result)).isEmpty();
		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.refreshToken")).isNotBlank();
		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.user.email")).isEqualTo("mts2@example.com");
		assertThat(JsonPath.<Map<String, Object>>read(result.getResponseBody(), "$")).doesNotContainKey("rememberedToken");
		// Single use, as in a browser.
		clock.advance(Duration.ofSeconds(30));
		twoStep(Map.of("pendingToken", pending, "code", SignInCodes.codeFor(key, clock.instant())))
			.expectStatus().isUnauthorized().expectBody().jsonPath("$.code").isEqualTo("sign_in_expired");
	}

	@Test
	void aRecoveryCodeFinishesTheSignInToo() {
		var recoveryCode = twoStepUserWithCodes("mts3@example.com").recoveryCodes().getFirst();
		var pending = pendingToken("mts3@example.com", null);

		twoStep(Map.of("pendingToken", pending, "recoveryCode", recoveryCode)).expectStatus().isOk();
	}

	@Test
	void wrongCodesCountDownAndThePendingSignInExpiresAsInABrowser() {
		var key = twoStepUser("mts4@example.com");
		var pending = pendingToken("mts4@example.com", null);

		twoStep(Map.of("pendingToken", pending, "code", wrongCode(key))).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code")
			.jsonPath("$.triesLeft").isEqualTo(4);

		clock.advance(Duration.ofMinutes(5).plusSeconds(1));
		twoStep(Map.of("pendingToken", pending, "code", SignInCodes.codeFor(key, clock.instant())))
			.expectStatus().isUnauthorized().expectBody().jsonPath("$.code").isEqualTo("sign_in_expired");
	}

	// Each mode reads only its own: the phone's request ignores a pending cookie.
	@Test
	void thePendingCookieMeansNothingToTheMobileApp() {
		var key = twoStepUser("mts5@example.com");
		var browserPending = client.post().uri("/api/auth/login")
			.body(Map.of("email", "mts5@example.com", "password", PASSWORD))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(header -> header.startsWith("two_step_pending="))
			.map(header -> header.substring("two_step_pending=".length(), header.indexOf(';')))
			.findFirst().orElseThrow();

		client.post().uri("/api/auth/two-step")
			.header("X-Nimbus-Client", "mobile")
			.cookie("two_step_pending", browserPending)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant())))
			.exchange()
			.expectStatus().isUnauthorized();
	}

	@Test
	void rememberingTheDeviceAnswersARememberedTokenThatSkipsTheCodeNextTime() {
		var key = twoStepUser("mts6@example.com");
		var pending = pendingToken("mts6@example.com", null);

		var result = twoStep(Map.of("pendingToken", pending, "code", SignInCodes.codeFor(key, clock.instant()),
				"rememberBrowser", true))
			.expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(cookieNames(result)).isEmpty();
		String remembered = JsonPath.read(result.getResponseBody(), "$.rememberedToken");
		assertThat(remembered).isNotBlank();
		var again = login("mts6@example.com", remembered).expectStatus().isOk().expectBody(String.class)
			.returnResult();
		assertThat(JsonPath.<String>read(again.getResponseBody(), "$.refreshToken")).isNotBlank();
		assertThat(again.getResponseBody()).doesNotContain("twoStepRequired");
		// A browser can't use it in the body: its remembered device is the cookie.
		client.post().uri("/api/auth/login")
			.body(Map.of("email", "mts6@example.com", "password", PASSWORD, "rememberedToken", remembered))
			.exchange().expectStatus().isOk().expectBody().jsonPath("$.twoStepRequired").isEqualTo(true);
	}

	@Test
	void anUnknownRememberedTokenStillAsksForTheCode() {
		twoStepUser("mts7@example.com");

		login("mts7@example.com", "not-a-token").expectStatus().isOk().expectBody()
			.jsonPath("$.twoStepRequired").isEqualTo(true);
	}

	/** Registers a verified User with Two-step verification on, and returns their authenticator key. */
	private String twoStepUser(String email) {
		return twoStepUserWithCodes(email).key();
	}

	private Setup twoStepUserWithCodes(String email) {
		String token = JsonPath.read(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD)).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, token, email);
		String key = JsonPath.read(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.key");
		List<String> recoveryCodes = JsonPath.read(client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody(), "$.recoveryCodes");
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		// The code that proved the key counts as used, so the next sign-in needs the next one.
		clock.advance(Duration.ofSeconds(30));
		return new Setup(key, recoveryCodes);
	}

	private RestTestClient.ResponseSpec login(String email, String rememberedToken) {
		var body = new HashMap<String, Object>(Map.of("email", email, "password", PASSWORD));
		if (rememberedToken != null) {
			body.put("rememberedToken", rememberedToken);
		}
		return client.post().uri("/api/auth/login").header("X-Nimbus-Client", "mobile").body(body).exchange();
	}

	private String pendingToken(String email, String rememberedToken) {
		return JsonPath.read(login(email, rememberedToken).expectStatus().isOk().expectBody(String.class)
			.returnResult().getResponseBody(), "$.pendingToken");
	}

	private RestTestClient.ResponseSpec twoStep(Map<String, Object> body) {
		return client.post().uri("/api/auth/two-step").header("X-Nimbus-Client", "mobile").body(body).exchange();
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

	private record Setup(String key, List<String> recoveryCodes) {
	}

}
