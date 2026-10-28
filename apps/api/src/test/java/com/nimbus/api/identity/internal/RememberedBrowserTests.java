package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * "Don't ask again on this device for 30 days" at the Sign-in code: a remembered browser skips the code at sign-in
 * for a fixed 30 days, until a security change makes every remembered browser ask again.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class RememberedBrowserTests {

	private static final String PASSWORD = "correct horse";

	private static final String NEW_PASSWORD = "new password";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	SessionCleanup cleanup;

	@Autowired
	JdbcClient jdbc;

	@Test
	void aRememberedBrowserSkipsTheCodeForAFixed30Days() {
		var user = twoStepUser("rb1@example.com");
		var remembered = signInWithCode(user, PASSWORD, true).remembered();
		assertThat(remembered).isNotNull();

		clock.advance(Duration.ofDays(15));
		assertSkipsTheCode(user.email(), PASSWORD, remembered);
		clock.advance(Duration.ofDays(14));
		// Day 29: still remembered, and being used on days 15 and 29 didn't move the end.
		assertSkipsTheCode(user.email(), PASSWORD, remembered);
		clock.advance(Duration.ofDays(2));

		assertAsksForTheCode(user.email(), PASSWORD, remembered);
	}

	@Test
	void theCookieIsHttpOnlySecureLaxOnApiFor30Days() {
		var user = twoStepUser("rb2@example.com");

		var header = signInWithCode(user, PASSWORD, true).header();

		assertThat(header).contains("HttpOnly").contains("Secure").contains("SameSite=Lax").contains("Path=/api;")
			.contains("Max-Age=" + Duration.ofDays(30).toSeconds());
	}

	@Test
	void withoutTheTickNothingIsRemembered() {
		var user = twoStepUser("rb3@example.com");

		assertThat(signInWithCode(user, PASSWORD, false).remembered()).isNull();

		assertAsksForTheCode(user.email(), PASSWORD, null);
	}

	@Test
	void anotherUserOnTheBrowserIsStillAsked() {
		var first = twoStepUser("rb4a@example.com");
		var second = twoStepUser("rb4b@example.com");
		var remembered = signInWithCode(first, PASSWORD, true).remembered();

		assertAsksForTheCode(second.email(), PASSWORD, remembered);
	}

	@Test
	void signingOutKeepsIt() {
		var user = twoStepUser("rb5@example.com");
		var signedIn = signInWithCode(user, PASSWORD, true);

		client.post().uri("/api/auth/logout").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", signedIn.refreshToken()).exchange().expectStatus().isNoContent();

		assertSkipsTheCode(user.email(), PASSWORD, signedIn.remembered());
	}

	@Test
	void aPasswordChangeForgetsEveryRememberedBrowser() {
		var user = twoStepUser("rb6@example.com");
		var signedIn = signInWithCode(user, PASSWORD, true);

		client.put().uri("/api/users/me/password").header("Authorization", "Bearer " + signedIn.accessToken())
			.body(Map.of("currentPassword", PASSWORD, "newPassword", NEW_PASSWORD)).exchange().expectStatus()
			.isNoContent();

		assertAsksForTheCode(user.email(), NEW_PASSWORD, signedIn.remembered());
	}

	@Test
	void aResetForgetsEveryRememberedBrowser() {
		var user = twoStepUser("rb7@example.com");
		var remembered = signInWithCode(user, PASSWORD, true).remembered();
		// The address's send budget allows the Reset code mail.
		clock.advance(Duration.ofSeconds(61));
		// The new-sign-in Security alert is sent after the commit; wait for it so it isn't mistaken for the Reset code mail.
		await().atMost(Duration.ofSeconds(10)).until(() -> RecordingMailer.sentTo(user.email()).stream()
			.anyMatch(m -> m.subject().equals("New sign-in to your account")));
		var before = RecordingMailer.sentTo(user.email()).size();
		client.post().uri("/api/auth/password-reset").body(Map.of("email", user.email())).exchange().expectStatus()
			.isNoContent();
		await().atMost(Duration.ofSeconds(10)).until(() -> RecordingMailer.sentTo(user.email()).size() > before);

		client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", user.email(), "code", RecordingMailer.lastCodeFor(user.email()), "newPassword",
					NEW_PASSWORD, "twoStepCode", SignInCodes.codeFor(user.key(), clock.instant())))
			.exchange().expectStatus().isNoContent();

		assertAsksForTheCode(user.email(), NEW_PASSWORD, remembered);
	}

	@Test
	void removeForgetsEveryRememberedBrowser() {
		var user = twoStepUser("rb8@example.com");
		var remembered = signInWithCode(user, PASSWORD, true).remembered();
		clock.advance(Duration.ofSeconds(30));

		client.method(HttpMethod.DELETE).uri("/api/users/me/two-step").header("Authorization", "Bearer " + user.token())
			.body(Map.of("code", SignInCodes.codeFor(user.key(), clock.instant()))).exchange().expectStatus()
			.isNoContent();

		assertThat(rowsOf(user.email())).isZero();
	}

	@Test
	void signingOutOtherDevicesForgetsTheirBrowsersButKeepsThisOne() {
		var user = twoStepUser("rb9@example.com");
		var other = signInWithCode(user, PASSWORD, true);
		clock.advance(Duration.ofSeconds(30));
		var here = signInWithCode(user, PASSWORD, true);

		client.post().uri("/api/users/me/sessions/sign-out-others").header("Authorization", "Bearer " + here.accessToken())
			.cookie(RememberedBrowsers.COOKIE, here.remembered()).exchange().expectStatus().isNoContent();

		assertSkipsTheCode(user.email(), PASSWORD, here.remembered());
		assertAsksForTheCode(user.email(), PASSWORD, other.remembered());
	}

	@Test
	void signingOutOtherDevicesWithoutTheCookieForgetsThemAll() {
		var user = twoStepUser("rb10@example.com");
		var remembered = signInWithCode(user, PASSWORD, true).remembered();

		client.post().uri("/api/users/me/sessions/sign-out-others").header("Authorization", "Bearer " + user.token())
			.exchange().expectStatus().isNoContent();

		assertAsksForTheCode(user.email(), PASSWORD, remembered);
	}

	@Test
	void theCleanupDeletesExpiredRememberedBrowsers() {
		var user = twoStepUser("rb11@example.com");
		signInWithCode(user, PASSWORD, true);
		clock.advance(Duration.ofSeconds(30));
		signInWithCode(user, PASSWORD, true);
		assertThat(rowsOf(user.email())).isEqualTo(2);

		clock.advance(Duration.ofDays(29));
		cleanup.run();
		assertThat(rowsOf(user.email())).isEqualTo(2);
		clock.advance(Duration.ofDays(2));
		cleanup.run();

		assertThat(rowsOf(user.email())).isZero();
	}

	private void assertSkipsTheCode(String email, String password, String remembered) {
		login(email, password, remembered).expectStatus().isOk().expectBody().jsonPath("$.accessToken").isNotEmpty()
			.jsonPath("$.twoStepRequired").doesNotExist();
	}

	private void assertAsksForTheCode(String email, String password, String remembered) {
		login(email, password, remembered).expectStatus().isOk().expectBody().jsonPath("$.twoStepRequired")
			.isEqualTo(true).jsonPath("$.accessToken").doesNotExist();
	}

	private RestTestClient.ResponseSpec login(String email, String password, String remembered) {
		var request = client.post().uri("/api/auth/login").body(Map.of("email", email, "password", password));
		if (remembered != null) {
			request = request.cookie(RememberedBrowsers.COOKIE, remembered);
		}
		return request.exchange();
	}

	/** Signs in with the password and the current Sign-in code, ticking "Don't ask again" or not. */
	private SignedIn signInWithCode(TwoStepUser user, String password, boolean rememberBrowser) {
		var pending = cookieValue(login(user.email(), password, null).expectStatus().isOk().expectBody(String.class)
			.returnResult(), PendingSignIns.COOKIE);
		var body = new HashMap<String, Object>();
		body.put("code", SignInCodes.codeFor(user.key(), clock.instant()));
		body.put("rememberBrowser", rememberBrowser);
		var result = client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie(PendingSignIns.COOKIE, pending).body(body).exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult();
		// The code counts as used, so the next sign-in needs the next one.
		clock.advance(Duration.ofSeconds(30));
		return new SignedIn(JsonPath.read(result.getResponseBody(), "$.accessToken"),
				cookieValue(result, "refresh_token"), cookieValue(result, RememberedBrowsers.COOKIE),
				setCookieHeader(result, RememberedBrowsers.COOKIE));
	}

	/** Registers a verified User with Two-step verification on. */
	private TwoStepUser twoStepUser(String email) {
		String token = JsonPath.read(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD)).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, token, email);
		String key = JsonPath.read(client.post().uri("/api/users/me/two-step/setup")
			.header("Authorization", "Bearer " + token).exchange().expectStatus().isOk().expectBody(String.class)
			.returnResult().getResponseBody(), "$.key");
		List<String> codes = JsonPath.read(client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody(), "$.recoveryCodes");
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		// The code that proved the key counts as used, so the next check needs the next one.
		clock.advance(Duration.ofSeconds(30));
		return new TwoStepUser(email, token, key, codes);
	}

	private int rowsOf(String email) {
		return jdbc.sql("SELECT count(*) FROM remembered_browsers WHERE user_id = (SELECT id FROM users WHERE email = ?)")
			.param(email).query(Integer.class).single();
	}

	/** The value of the cookie a response set; null when it set none. */
	private static String cookieValue(EntityExchangeResult<?> result, String name) {
		var header = setCookieHeader(result, name);
		return header == null ? null : header.substring(name.length() + 1, header.indexOf(';'));
	}

	private static String setCookieHeader(EntityExchangeResult<?> result, String name) {
		return result.getResponseHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(header -> header.startsWith(name + "="))
			.findFirst().orElse(null);
	}

	/** @param remembered null when the browser wasn't remembered */
	private record SignedIn(String accessToken, String refreshToken, String remembered, String header) {
	}

	private record TwoStepUser(String email, String token, String key, List<String> recoveryCodes) {
	}

}
