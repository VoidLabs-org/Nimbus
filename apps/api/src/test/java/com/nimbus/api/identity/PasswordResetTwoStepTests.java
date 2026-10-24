package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Stream;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
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
 * Forgot password for a User with Two-step verification (ADR 0005): a right Reset code alone changes nothing, and a
 * Sign-in code or a Recovery code has to come with it.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, PasswordResetTwoStepTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class PasswordResetTwoStepTests {

	private static final String PASSWORD = "correct horse";

	private static final String NEW_PASSWORD = "new password";

	private static final String RESET_SUBJECT = "Your Nimbus password reset code";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	Listener listener;

	@Test
	void aRightResetCodeAloneAsksForTheSecondCodeAndLeavesTheResetCodeUsable() {
		var user = twoStepUser("prt1@example.com");
		var resetCode = resetCodeFor(user.email());

		reset(user.email(), resetCode, Map.of()).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("two_step_required");

		login(user.email(), PASSWORD).expectStatus().isOk();
		reset(user.email(), resetCode, Map.of("twoStepCode", SignInCodes.codeFor(user.key(), clock.instant())))
			.expectStatus().isNoContent();
	}

	@Test
	void aWrongSecondCodeChangesNothingAndDoesNotUseUpTheResetCodesTries() {
		var user = twoStepUser("prt2@example.com");
		var resetCode = resetCodeFor(user.email());

		// More wrong second codes than a Reset code has tries.
		for (var attempt = 0; attempt < 6; attempt++) {
			var wrong = attempt % 2 == 0 ? Map.of("twoStepCode", wrongCode(user.key()))
					: Map.of("recoveryCode", "aaaa-aaaa");
			reset(user.email(), resetCode, wrong).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
				.isEqualTo("invalid_two_step_code").jsonPath("$.triesLeft").doesNotExist();
		}
		login(user.email(), PASSWORD).expectStatus().isOk();
		sessionStillRuns(user.token());

		reset(user.email(), resetCode, Map.of("twoStepCode", SignInCodes.codeFor(user.key(), clock.instant())))
			.expectStatus().isNoContent();
	}

	@Test
	void wrongSecondCodesCountTowardTheHourlyLock() {
		var user = twoStepUser("prt3@example.com");
		var resetCode = resetCodeFor(user.email());

		for (var attempt = 0; attempt < 10; attempt++) {
			reset(user.email(), resetCode, Map.of("twoStepCode", wrongCode(user.key()))).expectStatus().isBadRequest();
		}

		reset(user.email(), resetCode, Map.of("twoStepCode", SignInCodes.codeFor(user.key(), clock.instant())))
			.expectStatus().isEqualTo(429).expectHeader().exists(HttpHeaders.RETRY_AFTER);
		sessionStillRuns(user.token());
	}

	@Test
	void aRightSignInCodeResetsThePasswordEndsEverySessionAndTwoStepVerificationStaysOn() {
		var user = twoStepUser("prt4@example.com");

		reset(user.email(), resetCodeFor(user.email()),
				Map.of("twoStepCode", SignInCodes.codeFor(user.key(), clock.instant())))
			.expectStatus().isNoContent();

		client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + user.token()).exchange()
			.expectStatus().isUnauthorized();
		login(user.email(), PASSWORD).expectStatus().isUnauthorized();
		login(user.email(), NEW_PASSWORD).expectStatus().isOk().expectBody().jsonPath("$.twoStepRequired")
			.isEqualTo(true).jsonPath("$.accessToken").doesNotExist();
	}

	@Test
	void aRightRecoveryCodeResetsThePasswordAndIsUsedUp() {
		var user = twoStepUser("prt5@example.com");
		var recoveryCode = user.recoveryCodes().getFirst();

		reset(user.email(), resetCodeFor(user.email()), Map.of("recoveryCode", recoveryCode.toUpperCase()))
			.expectStatus().isNoContent();

		var token = signInWithCode(user, NEW_PASSWORD);
		client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$.enabled").isEqualTo(true)
			.jsonPath("$.recoveryCodesLeft").isEqualTo(9);
		var used = listener.about(user.id());
		assertThat(used).singleElement().satisfies(event -> assertThat(event.codesLeft()).isEqualTo(9));
		// The address's send budget allows the next Reset code mail.
		clock.advance(Duration.ofSeconds(61));
		reset(user.email(), resetCodeFor(user.email()), Map.of("recoveryCode", recoveryCode)).expectStatus()
			.isBadRequest().expectBody().jsonPath("$.code").isEqualTo("invalid_two_step_code");
	}

	@Test
	void aWrongOrExpiredResetCodeAnswersAsUsualWhateverSecondCodeComes() {
		var user = twoStepUser("prt6@example.com");
		var resetCode = resetCodeFor(user.email());
		var otherCode = resetCode.equals("000000") ? "000001" : "000000";
		var right = Map.of("twoStepCode", SignInCodes.codeFor(user.key(), clock.instant()));

		reset(user.email(), otherCode, right).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("invalid_code").jsonPath("$.triesLeft").isEqualTo(4);
		reset(user.email(), otherCode, Map.of()).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("invalid_code").jsonPath("$.triesLeft").isEqualTo(3);
		reset("prt-nobody@example.com", otherCode, right).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("code_expired");

		clock.advance(Duration.ofMinutes(16));
		reset(user.email(), resetCode, right).expectStatus().isBadRequest().expectBody().jsonPath("$.code")
			.isEqualTo("code_expired");
	}

	@Test
	void aUserWithoutTwoStepVerificationResetsAsBeforeAndASecondCodeIsIgnored() {
		var email = "prt7@example.com";
		register(email);
		clock.advance(Duration.ofSeconds(61));

		reset(email, resetCodeFor(email), Map.of("twoStepCode", "123456")).expectStatus().isNoContent();

		login(email, NEW_PASSWORD).expectStatus().isOk().expectBody().jsonPath("$.accessToken").isNotEmpty();
	}

	private void sessionStillRuns(String token) {
		client.get().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isOk().expectBody().jsonPath("$.enabled").isEqualTo(true);
	}

	/** Signs in with the password and the next Sign-in code; returns the access token. */
	private String signInWithCode(TwoStepUser user, String password) {
		var result = login(user.email(), password).expectStatus().isOk().expectBody(String.class).returnResult();
		var pending = result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(header -> header.startsWith("two_step_pending="))
			.map(header -> header.substring("two_step_pending=".length(), header.indexOf(';')))
			.findFirst().orElseThrow();
		return JsonPath.read(body(client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie("two_step_pending", pending)
			.body(Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()))).exchange().expectStatus()
			.isOk()), "$.accessToken");
	}

	/** A code that fits no step within a minute of now. */
	private String wrongCode(String key) {
		var near = Stream.of(-30, 0, 30)
			.map(seconds -> SignInCodes.codeFor(key, clock.instant().plusSeconds(seconds)))
			.toList();
		return Stream.of("999999", "999998", "999997").filter(code -> !near.contains(code)).findFirst().orElseThrow();
	}

	/** @return the register answer: the access token and the User */
	private String register(String email) {
		return body(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD)).exchange()
			.expectStatus().isCreated());
	}

	/** Registers a verified User with Two-step verification on. */
	private TwoStepUser twoStepUser(String email) {
		var registered = register(email);
		String token = JsonPath.read(registered, "$.accessToken");
		String id = JsonPath.read(registered, "$.user.id");
		EmailCodes.verify(client, token, email);
		String key = JsonPath.read(body(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange().expectStatus().isOk()), "$.key");
		List<String> codes = JsonPath.read(body(client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk()),
				"$.recoveryCodes");
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		// The code that proved the key counts as used, so the next check needs the next one; the wait also lets the
		// address's send budget allow the Reset code mail.
		clock.advance(Duration.ofSeconds(61));
		return new TwoStepUser(email, id, token, key, codes);
	}

	/** Asks for a Reset code and waits for its email. */
	private String resetCodeFor(String email) {
		var before = resetMails(email);
		client.post().uri("/api/auth/password-reset").body(Map.of("email", email)).exchange().expectStatus()
			.isNoContent();
		await().atMost(Duration.ofSeconds(10)).until(() -> resetMails(email) > before);
		return RecordingMailer.lastCodeFor(email);
	}

	private static long resetMails(String email) {
		return RecordingMailer.sentTo(email).stream().filter(mail -> mail.subject().equals(RESET_SUBJECT)).count();
	}

	private RestTestClient.ResponseSpec reset(String email, String code, Map<String, String> secondCode) {
		var body = new HashMap<String, String>(secondCode);
		body.put("email", email);
		body.put("code", code);
		body.put("newPassword", NEW_PASSWORD);
		return client.post().uri("/api/auth/password-reset/confirm").body(body).exchange();
	}

	private RestTestClient.ResponseSpec login(String email, String password) {
		return client.post().uri("/api/auth/login").body(Map.of("email", email, "password", password)).exchange();
	}

	private static String body(RestTestClient.ResponseSpec response) {
		return response.expectBody(String.class).returnResult().getResponseBody();
	}

	private record TwoStepUser(String email, String id, String token, String key, List<String> recoveryCodes) {
	}

	@TestConfiguration
	static class Listener {

		private final List<RecoveryCodeUsed> received = new CopyOnWriteArrayList<>();

		@EventListener
		void on(RecoveryCodeUsed event) {
			received.add(event);
		}

		List<RecoveryCodeUsed> about(String userId) {
			return received.stream().filter(event -> event.userId().toString().equals(userId)).toList();
		}

	}

}
