package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Signing in with a Recovery code instead of a Sign-in code, for a User who lost their phone. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class RecoveryCodeSignInTests {

	private static final String PASSWORD = "correct horse";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void aRecoveryCodeSignsInOnceAndIsRefusedTheSecondTime() {
		var user = twoStepUser("rcs1@example.com");
		var code = user.recoveryCodes().getFirst();

		var signedIn = recoveryCode(pendingSignIn("rcs1@example.com"), code).expectStatus().isOk()
			.expectBody(String.class).returnResult();
		assertThat(JsonPath.<String>read(signedIn.getResponseBody(), "$.accessToken")).isNotEmpty();
		assertThat(signedIn.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE))
			.anyMatch(cookie -> cookie.startsWith("refresh_token="));

		recoveryCode(pendingSignIn("rcs1@example.com"), code).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("invalid_code")
			.jsonPath("$.triesLeft").isEqualTo(4);
	}

	@Test
	void capitalsSpacesAndTheDashAreIgnored() {
		var user = twoStepUser("rcs2@example.com");
		var typed = " " + user.recoveryCodes().get(1).toUpperCase(Locale.ROOT).replace("-", " ") + " ";

		recoveryCode(pendingSignIn("rcs2@example.com"), typed).expectStatus().isOk();
		recoveryCode(pendingSignIn("rcs2@example.com"), user.recoveryCodes().get(2).replace("-", ""))
			.expectStatus().isOk();
	}

	// As a code comes out of a PDF or a notes app: a no-break space, a tab, or a Unicode hyphen or dash.
	@Test
	void unicodeSpacesAndDashesAreIgnoredToo() {
		var user = twoStepUser("rcs8@example.com");
		var noBreakSpace = Character.toString(0x00A0);
		var nonBreakingHyphen = Character.toString(0x2011);
		var enDash = Character.toString(0x2013);

		recoveryCode(pendingSignIn("rcs8@example.com"),
				noBreakSpace + user.recoveryCodes().get(0).replace("-", nonBreakingHyphen) + "\t").expectStatus().isOk();
		recoveryCode(pendingSignIn("rcs8@example.com"), user.recoveryCodes().get(1).replace("-", enDash))
			.expectStatus().isOk();
	}

	@Test
	void aBlankRecoveryCodeCountsAsNoneSoTheSignInCodeIsChecked() {
		var user = twoStepUser("rcs9@example.com");

		client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie("two_step_pending", pendingSignIn("rcs9@example.com"))
			.body(Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()), "recoveryCode", " ")).exchange()
			.expectStatus().isOk();
	}

	@Test
	void wrongRecoveryCodesCountTowardTheFiveTriesAndTheHourlyLock() {
		var user = twoStepUser("rcs3@example.com");

		var pending = pendingSignIn("rcs3@example.com");
		for (var attempt = 4; attempt > 0; attempt--) {
			recoveryCode(pending, "zzzz-zzzz").expectStatus().isBadRequest().expectBody()
				.jsonPath("$.triesLeft").isEqualTo(attempt);
		}
		recoveryCode(pending, "zzzz-zzzz").expectStatus().isUnauthorized().expectBody().jsonPath("$.code")
			.isEqualTo("sign_in_expired");

		pending = pendingSignIn("rcs3@example.com");
		for (var attempt = 0; attempt < 4; attempt++) {
			recoveryCode(pending, "zzzz-zzzz").expectStatus().isBadRequest();
		}
		recoveryCode(pending, "zzzz-zzzz").expectStatus().isUnauthorized();

		recoveryCode(pendingSignIn("rcs3@example.com"), user.recoveryCodes().getFirst()).expectStatus().isEqualTo(429);
	}

	@Test
	void theSecurityPageCountGoesDown() {
		var user = twoStepUser("rcs4@example.com");

		recoveryCode(pendingSignIn("rcs4@example.com"), user.recoveryCodes().getFirst()).expectStatus().isOk();
		recoveryCode(pendingSignIn("rcs4@example.com"), user.recoveryCodes().get(1)).expectStatus().isOk();

		client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + user.token()).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$.recoveryCodesLeft").isEqualTo(8);
	}

	@Test
	void aRecoveryCodeOfAnotherUserIsWrong() {
		var other = twoStepUser("rcs5@example.com");
		twoStepUser("rcs6@example.com");

		recoveryCode(pendingSignIn("rcs6@example.com"), other.recoveryCodes().getFirst()).expectStatus()
			.isBadRequest();
	}

	@Test
	void anOverlongRecoveryCodeIsRefusedAsInvalid() {
		twoStepUser("rcs7@example.com");

		recoveryCode(pendingSignIn("rcs7@example.com"), "a".repeat(65)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.recoveryCode").isNotEmpty();
	}

	/** A verified User with Two-step verification on, with the Recovery codes they saved. */
	private TwoStepUser twoStepUser(String email) {
		String token = JsonPath.read(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD)).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, token, email);
		String key = JsonPath.read(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.key");
		List<String> codes = JsonPath.read(client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange()
			.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.recoveryCodes");
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		clock.advance(Duration.ofSeconds(30));
		return new TwoStepUser(token, key, codes);
	}

	private String pendingSignIn(String email) {
		var header = client.post().uri("/api/auth/login").body(Map.of("email", email, "password", PASSWORD))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseHeaders()
			.getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(cookie -> cookie.startsWith("two_step_pending="))
			.findFirst()
			.orElseThrow(() -> new AssertionError("no two_step_pending cookie was set"));
		return header.substring("two_step_pending=".length(), header.indexOf(';'));
	}

	private RestTestClient.ResponseSpec recoveryCode(String pending, String code) {
		return client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie("two_step_pending", pending).body(Map.of("recoveryCode", code)).exchange();
	}

	private record TwoStepUser(String token, String key, List<String> recoveryCodes) {
	}

}
