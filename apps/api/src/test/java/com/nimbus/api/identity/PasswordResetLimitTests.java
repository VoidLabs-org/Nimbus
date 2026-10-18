package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;

import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Nobody can flood an inbox or spray guesses through forgot-password: the shared send budget and the per-IP limits. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = { "nimbus.auth.password-reset-requests-per-address=8",
				"nimbus.auth.password-resets-per-address=3" })
@AutoConfigureRestTestClient
class PasswordResetLimitTests {

	private static final String RESET_SUBJECT = "Your Nimbus password reset code";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	/** Every test starts with empty windows, whatever the ones before it used. */
	@BeforeEach
	void emptyWindows() {
		clock.advance(Duration.ofHours(2));
	}

	@Test
	void requestsToOneAddressMustBeSixtySecondsApart() {
		var email = "lim-ada@example.com";
		register(email);
		clock.advance(Duration.ofSeconds(61));
		request(email).expectStatus().isNoContent();
		awaitResetCode(email, 1);

		clock.advance(Duration.ofSeconds(59));
		request(email.toUpperCase()).expectStatus().isEqualTo(429)
			.expectHeader().value("Retry-After", value -> assertThat(Long.parseLong(value)).isEqualTo(1L));

		clock.advance(Duration.ofSeconds(1));
		request(email).expectStatus().isNoContent();
		awaitResetCode(email, 2);
	}

	@Test
	void theSendBudgetIsSharedWithVerificationCodes() {
		var email = "lim-bea@example.com";
		register(email); // mails a Verification code

		request(email).expectStatus().isEqualTo(429).expectHeader().exists("Retry-After");
		assertThat(resetMails(email)).isZero();

		clock.advance(Duration.ofSeconds(61));
		request(email).expectStatus().isNoContent();
		awaitResetCode(email, 1);
	}

	@Test
	void atMostFiveEmailsAnHourGoToOneAddress() {
		var email = "lim-cy@example.com";
		for (var sent = 1; sent <= 5; sent++) {
			request(email).expectStatus().isNoContent();
			clock.advance(Duration.ofSeconds(61));
		}

		request(email).expectStatus().isEqualTo(429)
			.expectHeader().value("Retry-After", value -> assertThat(Long.parseLong(value)).isGreaterThan(60L));

		clock.advance(Duration.ofHours(1));
		request(email).expectStatus().isNoContent();
	}

	@Test
	void anUnregisteredAddressIsLimitedAndRefusedJustLikeARegisteredOne() {
		var registered = "lim-dee@example.com";
		var unknown = "lim-nobody@example.com";
		register(registered);
		clock.advance(Duration.ofSeconds(61));

		request(registered).expectStatus().isNoContent();
		request(unknown).expectStatus().isNoContent();

		var forRegistered = request(registered).expectStatus().isEqualTo(429)
			.expectBody(String.class).returnResult();
		var forUnknown = request(unknown).expectStatus().isEqualTo(429)
			.expectBody(String.class).returnResult();
		assertThat(forUnknown.getResponseBody()).isEqualTo(forRegistered.getResponseBody());
		assertThat(forUnknown.getResponseHeaders().getFirst("Retry-After"))
			.isEqualTo(forRegistered.getResponseHeaders().getFirst("Retry-After"));
		assertThat(RecordingMailer.attemptedTo(unknown)).isEmpty();
	}

	@Test
	void aRefusedRequestLeavesTheLiveCodeWorking() {
		var email = "lim-eli@example.com";
		register(email);
		clock.advance(Duration.ofSeconds(61));
		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);

		request(email).expectStatus().isEqualTo(429);

		assertThat(resetMails(email)).isEqualTo(1);
		reset(email, code, "new password").expectStatus().isNoContent();
	}

	@Test
	void oneIpAddressMayAskForOnlyEightCodesInTheWindow() {
		for (var asked = 1; asked <= 8; asked++) {
			request("lim-ip" + asked + "@example.com").expectStatus().isNoContent();
		}

		request("lim-ip9@example.com").expectStatus().isEqualTo(429)
			.expectHeader().value("Retry-After", value -> assertThat(Long.parseLong(value)).isPositive());

		clock.advance(Duration.ofMinutes(15));
		request("lim-ip9@example.com").expectStatus().isNoContent();
	}

	@Test
	void oneIpAddressMayTryOnlyThreeResetsInTheWindow() {
		for (var tried = 1; tried <= 3; tried++) {
			reset("lim-fay@example.com", "123456", "new password").expectStatus().isBadRequest();
		}

		reset("lim-fay@example.com", "123456", "new password").expectStatus().isEqualTo(429)
			.expectHeader().value("Retry-After", value -> assertThat(Long.parseLong(value)).isPositive());

		clock.advance(Duration.ofMinutes(15));
		reset("lim-fay@example.com", "123456", "new password").expectStatus().isBadRequest();
	}

	@Test
	void theRequestLimitAndTheResetLimitAreCountedApart() {
		for (var asked = 1; asked <= 3; asked++) {
			request("lim-gus" + asked + "@example.com").expectStatus().isNoContent();
		}

		reset("lim-gus1@example.com", "123456", "new password").expectStatus().isBadRequest();
	}

	private void register(String email) {
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Pat", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated();
	}

	private RestTestClient.ResponseSpec request(String email) {
		return client.post().uri("/api/auth/password-reset").body(Map.of("email", email)).exchange();
	}

	private RestTestClient.ResponseSpec reset(String email, String code, String newPassword) {
		return client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", email, "code", code, "newPassword", newPassword))
			.exchange();
	}

	private static String awaitResetCode(String email, int count) {
		await().atMost(Duration.ofSeconds(10)).until(() -> resetMails(email) >= count);
		return RecordingMailer.lastCodeFor(email);
	}

	private static long resetMails(String email) {
		return RecordingMailer.sentTo(email).stream().filter(mail -> mail.subject().equals(RESET_SUBJECT)).count();
	}

}
