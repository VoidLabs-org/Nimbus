package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.mail.Mail;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Forgot password: a Reset code emailed to the address, entered with a new password. The request answers before
 * the code is issued and mailed, so tests wait for the email the way a person waits for their inbox.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, SecurityEvents.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class PasswordResetTests {

	private static final String RESET_SUBJECT = "Your Nimbus password reset code";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	SecurityEvents events;

	@Test
	void theEmailedCodeSetsANewPasswordAndTheOldOneStopsWorking() {
		var email = "pr-ada@example.com";
		register(email);

		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);
		reset(email, code, "new password").expectStatus().isNoContent();

		login(email, "new password").expectStatus().isOk();
		login(email, "correct horse").expectStatus().isUnauthorized();
		// Used up.
		reset(email, code, "another password").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");
	}

	@Test
	void aResetPublishesPasswordChangedAsAResetOnlyWhenItSucceeds() {
		var email = "pr-event@example.com";
		var id = java.util.UUID.fromString(JsonPath.read(register(email), "$.user.id"));
		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);

		reset(email, "000000".equals(code) ? "111111" : "000000", "new password").expectStatus().isBadRequest();
		assertThat(events.of(PasswordChanged.class, id)).isEmpty();

		reset(email, code, "new password").expectStatus().isNoContent();

		assertThat(events.of(PasswordChanged.class, id)).singleElement().satisfies(event -> assertThat(event.reset()).isTrue());
	}

	@Test
	void theResetEmailExplainsTheCodeAndKeepsItOutOfTheSubject() {
		var email = "pr-mail@example.com";
		register(email);

		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);

		var mail = lastResetMail(email);
		assertThat(mail.subject()).isEqualTo(RESET_SUBJECT).doesNotContain(code);
		assertThat(mail.text()).contains(code)
			.contains("Enter this in Nimbus to reset your password. It expires in 15 minutes.")
			.contains("If you didn't ask for this, ignore this email. Your password won't change.");
		var words = mail.html().replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ");
		assertThat(words).contains("Reset your password")
			.contains("Your reset code is " + code)
			.contains("Nimbus will never ask for this code by phone, chat or email.");
		// Only in the code tile: not in the title or the hidden preview line.
		assertThat(mail.html()).containsOnlyOnce(code)
			.contains(RecordingMailer.IMAGE_HOST + "/nimbus-icon-dark.png");
	}

	@Test
	void aResetEndsEverySessionOfTheUser() {
		var email = "pr-bea@example.com";
		var thisDevice = refreshCookie(registerResult(email));
		var otherDevice = refreshCookie(client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", "correct horse"))
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult());

		request(email).expectStatus().isNoContent();
		reset(email, awaitResetCode(email, 1), "new password").expectStatus().isNoContent();

		refresh(thisDevice).expectStatus().isUnauthorized();
		refresh(otherDevice).expectStatus().isUnauthorized();
	}

	@Test
	void anUnknownEmailGetsTheSameAnswersAndNothingIsSent() {
		var unknown = "pr-nobody@example.com";
		var known = "pr-cy@example.com";
		register(known);

		request(unknown).expectStatus().isNoContent();
		// The unknown email's background work started first and is the shorter of the two, so it is over once
		// the known email's code has arrived.
		request(known).expectStatus().isNoContent();
		awaitResetCode(known, 1);
		assertThat(RecordingMailer.attemptedTo(unknown)).isEmpty();

		var forUnknown = reset(unknown, "123456", "new password").expectStatus().isBadRequest()
			.expectBody(String.class).returnResult().getResponseBody();
		clock.advance(Duration.ofMinutes(16));
		var forExpired = reset(known, RecordingMailer.lastCodeFor(known), "new password").expectStatus().isBadRequest()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat(forUnknown).isEqualTo(forExpired);
		assertThat((String) JsonPath.read(forUnknown, "$.code")).isEqualTo("code_expired");
	}

	@Test
	void aWrongCodeSaysHowManyTriesAreLeftAndTheFifthCancelsTheCode() {
		var email = "pr-dee@example.com";
		register(email);
		request(email).expectStatus().isNoContent();
		var right = awaitResetCode(email, 1);
		var wrong = right.equals("000000") ? "111111" : "000000";

		for (var left = 4; left >= 1; left--) {
			reset(email, wrong, "new password").expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.code").isEqualTo("invalid_code")
				.jsonPath("$.triesLeft").isEqualTo(left);
		}
		reset(email, wrong, "new password").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");

		reset(email, right, "new password").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");
		login(email, "correct horse").expectStatus().isOk();
	}

	@Test
	void aCodeExpiresAfterFifteenMinutes() {
		var email = "pr-eli@example.com";
		register(email);
		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);

		clock.advance(Duration.ofMinutes(15));

		reset(email, code, "new password").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");
	}

	@Test
	void aCodeStillWorksJustBeforeFifteenMinutes() {
		var email = "pr-fay@example.com";
		register(email);
		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);

		clock.advance(Duration.ofMinutes(14).plusSeconds(59));

		reset(email, code, "new password").expectStatus().isNoContent();
	}

	@Test
	void aNewRequestReplacesTheOldCode() {
		var email = "pr-gus@example.com";
		register(email);
		request(email).expectStatus().isNoContent();
		var old = awaitResetCode(email, 1);
		var oldHash = storedResetHash(email);

		clock.advance(Duration.ofSeconds(61));
		request(email).expectStatus().isNoContent();
		var fresh = awaitResetCode(email, 2);

		assertThat(storedResetHash(email)).isNotEqualTo(oldHash);
		if (!old.equals(fresh)) {
			reset(email, old, "new password").expectStatus().isBadRequest()
				.expectBody().jsonPath("$.code").isEqualTo("invalid_code");
		}
		reset(email, fresh, "new password").expectStatus().isNoContent();
	}

	@Test
	void aNewPasswordThatBreaksTheRuleIsRefusedWithoutCountingATry() {
		var email = "pr-hal@example.com";
		register(email);
		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);
		var wrong = code.equals("000000") ? "111111" : "000000";

		for (var attempt = 0; attempt < 6; attempt++) {
			reset(email, wrong, "short").expectStatus().isBadRequest()
				.expectBody().jsonPath("$.errors.newPassword").isNotEmpty();
		}

		reset(email, wrong, "new password").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.triesLeft").isEqualTo(4);
		reset(email, code, "new password").expectStatus().isNoContent();
	}

	@Test
	void aResetClearsTheFailedSignInLockout() {
		var email = "pr-ivy@example.com";
		register(email);
		for (var attempt = 0; attempt < 5; attempt++) {
			login(email, "wrong password").expectStatus().isUnauthorized();
		}
		login(email, "correct horse").expectStatus().isEqualTo(429);

		request(email).expectStatus().isNoContent();
		reset(email, awaitResetCode(email, 1), "new password").expectStatus().isNoContent();

		login(email, "new password").expectStatus().isOk();
	}

	@Test
	void aResetCodeAndAVerificationCodeDoNotReplaceEachOther() {
		var email = "pr-jo@example.com";
		var token = accessToken(register(email));
		var verificationCode = RecordingMailer.lastCodeFor(email);

		request(email).expectStatus().isNoContent();
		var resetCode = awaitResetCode(email, 1);

		client.post().uri("/api/auth/verify-email").header("Authorization", "Bearer " + token)
			.body(Map.of("code", verificationCode))
			.exchange().expectStatus().isOk();
		reset(email, resetCode, "new password").expectStatus().isNoContent();
	}

	@Test
	void aResetThatVerifiesTheEmailUsesUpThePendingVerificationCode() {
		var email = "pr-ned@example.com";
		register(email);
		assertThat(verificationCodeRows(email)).isEqualTo(1);

		request(email).expectStatus().isNoContent();
		reset(email, awaitResetCode(email, 1), "new password").expectStatus().isNoContent();

		assertThat(verificationCodeRows(email)).isZero();
	}

	@Test
	void theDatabaseNeverHoldsTheResetCodeInPlainText() {
		var email = "pr-kim@example.com";
		register(email);
		request(email).expectStatus().isNoContent();
		var code = awaitResetCode(email, 1);

		assertThat(storedResetHash(email)).doesNotContain(code).hasSize(64);
	}

	@Test
	void aFailedSendChangesNothingInTheAnswer() {
		var email = "pr-lou@example.com";
		register(email);

		RecordingMailer.failing(true);
		try {
			request(email).expectStatus().isNoContent();
			await().atMost(Duration.ofSeconds(10)).until(() -> RecordingMailer.attemptedTo(email).stream()
				.anyMatch(mail -> mail.subject().equals(RESET_SUBJECT)));
		}
		finally {
			RecordingMailer.failing(false);
		}

		assertThat(resetMails(email)).isZero();
	}

	@Test
	void aSignedInUsersStaleTokenDoesNotGetInTheWay() {
		var email = "pr-max@example.com";
		var token = accessToken(register(email));

		client.post().uri("/api/auth/password-reset").header("Authorization", "Bearer " + token)
			.body(Map.of("email", email))
			.exchange().expectStatus().isNoContent();
		client.post().uri("/api/auth/password-reset/confirm").header("Authorization", "Bearer " + token)
			.body(Map.of("email", email, "code", awaitResetCode(email, 1), "newPassword", "new password"))
			.exchange().expectStatus().isNoContent();
	}

	private String register(String email) {
		return registerResult(email).getResponseBody();
	}

	/** Registering mails a Verification code, which spends the address's send budget; wait it out. */
	private EntityExchangeResult<String> registerResult(String email) {
		var result = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Pat", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult();
		clock.advance(Duration.ofSeconds(61));
		return result;
	}

	private static String accessToken(String response) {
		return JsonPath.read(response, "$.accessToken");
	}

	private static String refreshCookie(EntityExchangeResult<String> result) {
		return RefreshCookies.valueOf(result);
	}

	private RestTestClient.ResponseSpec refresh(String cookie) {
		return client.post().uri("/api/auth/refresh").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", cookie)
			.exchange();
	}

	/** Waits until {@code count} reset emails have reached {@code email}, and returns the newest one's code. */
	private static String awaitResetCode(String email, int count) {
		await().atMost(Duration.ofSeconds(10)).until(() -> resetMails(email) >= count);
		return RecordingMailer.lastCodeFor(email);
	}

	private static long resetMails(String email) {
		return RecordingMailer.sentTo(email).stream().filter(mail -> mail.subject().equals(RESET_SUBJECT)).count();
	}

	private static Mail lastResetMail(String email) {
		var mails = RecordingMailer.sentTo(email).stream().filter(mail -> mail.subject().equals(RESET_SUBJECT)).toList();
		return mails.get(mails.size() - 1);
	}

	private int verificationCodeRows(String email) {
		return jdbc.sql("SELECT count(*) FROM emailed_codes WHERE kind = 'VERIFICATION' AND user_id = (SELECT id FROM users WHERE email = ?)")
			.param(email).query(Integer.class).single();
	}

	private String storedResetHash(String email) {
		return jdbc.sql("SELECT code_hash FROM emailed_codes WHERE kind = 'RESET' AND user_id = (SELECT id FROM users WHERE email = ?)")
			.param(email).query(String.class).single();
	}

	private RestTestClient.ResponseSpec request(String email) {
		return client.post().uri("/api/auth/password-reset").body(Map.of("email", email)).exchange();
	}

	private RestTestClient.ResponseSpec reset(String email, String code, String newPassword) {
		return client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", email, "code", code, "newPassword", newPassword))
			.exchange();
	}

	private RestTestClient.ResponseSpec login(String email, String password) {
		return client.post().uri("/api/auth/login").body(Map.of("email", email, "password", password)).exchange();
	}

}
