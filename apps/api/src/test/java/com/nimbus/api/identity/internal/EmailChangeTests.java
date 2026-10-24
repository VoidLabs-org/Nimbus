package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.RefreshCookies;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Changing a verified User's email from Profile: a Verification code goes to the new address, and the right code
 * switches the email at once. Users register with a password and verify, so they can sign in by email.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class EmailChangeTests {

	private static final String PASSWORD = "correct horse";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	ExternalSignIn externalSignIn;

	@Test
	void theCodeFromTheNewInboxChangesTheEmailAndSignInMovesWithIt() {
		var token = verifiedUser("ec1-old@example.com");

		request(token, "ec1-new@example.com").expectStatus().isNoContent();
		var mails = RecordingMailer.sentTo("ec1-new@example.com");
		assertThat(mails).hasSize(1);
		assertThat(mails.get(0).subject()).isEqualTo("Confirm your new Nimbus email");
		assertThat(mails.get(0).text()).contains("expires in 15 minutes");

		confirm(token, RecordingMailer.lastCodeFor("ec1-new@example.com")).expectStatus().isOk().expectBody()
			.jsonPath("$.email").isEqualTo("ec1-new@example.com")
			.jsonPath("$.emailVerified").isEqualTo(true);

		signIn("ec1-new@example.com").expectStatus().isOk();
		signIn("ec1-old@example.com").expectStatus().isUnauthorized();
	}

	@Test
	void theSameEmailATakenOneAndAnInvalidOneAreRefusedAndNothingIsSent() {
		var token = verifiedUser("ec2@example.com");
		verifiedUser("ec2-taken@example.com");

		request(token, "  EC2@Example.com ").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("same_email");
		request(token, "Ec2-Taken@example.com").expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("email_taken");
		request(token, "not an email").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.email").isNotEmpty();

		assertThat(RecordingMailer.sentTo("ec2@example.com")).hasSize(1);
		assertThat(RecordingMailer.sentTo("ec2-taken@example.com")).hasSize(1);
	}

	@Test
	void aSignInOlderThanTenMinutesMustBeRenewedButEnteringTheCodeLaterIsFine() {
		var token = verifiedUser("ec3-old@example.com");

		request(token, "ec3-new@example.com").expectStatus().isNoContent();
		clock.advance(Duration.ofMinutes(10).plusSeconds(1));

		request(token, "ec3-other@example.com").expectStatus().isForbidden().expectBody()
			.jsonPath("$.code").isEqualTo("reauth_required");
		assertThat(RecordingMailer.sentTo("ec3-other@example.com")).isEmpty();
		// The code mailed before is still good: entering it is proof enough.
		confirm(token, RecordingMailer.lastCodeFor("ec3-new@example.com")).expectStatus().isOk();
	}

	@Test
	void aWrongCodeSaysHowManyTriesAreLeftAndTheFifthCancelsTheChange() {
		var token = verifiedUser("ec4-old@example.com");
		request(token, "ec4-new@example.com").expectStatus().isNoContent();
		var right = RecordingMailer.lastCodeFor("ec4-new@example.com");
		var wrong = right.equals("000000") ? "111111" : "000000";

		for (var left = 4; left >= 1; left--) {
			confirm(token, wrong).expectStatus().isBadRequest().expectBody()
				.jsonPath("$.code").isEqualTo("invalid_code")
				.jsonPath("$.triesLeft").isEqualTo(left);
		}
		confirm(token, wrong).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("code_expired");

		confirm(token, right).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("code_expired");
		signIn("ec4-old@example.com").expectStatus().isOk();
	}

	@Test
	void aCodeExpiresAfterFifteenMinutesAndWithoutOneNothingIsPending() {
		var token = verifiedUser("ec5-old@example.com");
		confirm(token, "123456").expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("code_expired");

		request(token, "ec5-new@example.com").expectStatus().isNoContent();
		clock.advance(Duration.ofMinutes(15));

		confirm(token, RecordingMailer.lastCodeFor("ec5-new@example.com")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("code_expired");
	}

	@Test
	void aCodeToASecondAddressReplacesTheFirst() {
		var token = verifiedUser("ec6-old@example.com");
		request(token, "ec6-first@example.com").expectStatus().isNoContent();
		var first = RecordingMailer.lastCodeFor("ec6-first@example.com");
		request(token, "ec6-second@example.com").expectStatus().isNoContent();
		var second = RecordingMailer.lastCodeFor("ec6-second@example.com");

		if (!first.equals(second)) {
			confirm(token, first).expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("invalid_code");
		}
		confirm(token, second).expectStatus().isOk().expectBody().jsonPath("$.email").isEqualTo("ec6-second@example.com");
		signIn("ec6-first@example.com").expectStatus().isUnauthorized();
	}

	@Test
	void anAddressTakenAfterTheCodeWasSentIsRefusedAndTheEmailStays() {
		var token = verifiedUser("ec7-old@example.com");
		request(token, "ec7-new@example.com").expectStatus().isNoContent();
		var code = RecordingMailer.lastCodeFor("ec7-new@example.com");
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Quick", "email", "ec7-new@example.com", "password", PASSWORD))
			.exchange().expectStatus().isCreated();

		confirm(token, code).expectStatus().isEqualTo(409).expectBody().jsonPath("$.code").isEqualTo("email_taken");

		me(token).expectStatus().isOk().expectBody().jsonPath("$.email").isEqualTo("ec7-old@example.com");
	}

	@Test
	void codesToOneNewAddressSpendItsSendBudget() {
		var token = verifiedUser("ec8-old@example.com");
		request(token, "ec8-new@example.com").expectStatus().isNoContent();
		var code = RecordingMailer.lastCodeFor("ec8-new@example.com");

		request(token, "ec8-new@example.com").expectStatus().isEqualTo(429)
			.expectHeader().exists("Retry-After");

		assertThat(RecordingMailer.sentTo("ec8-new@example.com")).hasSize(1);
		// A refused resend leaves the pending change alone.
		confirm(token, code).expectStatus().isOk();
	}

	@Test
	void onlyTheEmailChangesOtherSessionsAndGoogleKeepWorking() {
		var token = verifiedUser("ec9-old@example.com");
		var laptop = client.post().uri("/api/auth/login")
			.body(Map.of("email", "ec9-old@example.com", "password", PASSWORD))
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult();
		var google = externalSignIn
			.signIn(new ExternalProfile("google", "g-ec9", "ec9-old@example.com", true, "Someone", null, "ec9-old@example.com"));

		request(token, "ec9-new@example.com").expectStatus().isNoContent();
		confirm(token, RecordingMailer.lastCodeFor("ec9-new@example.com")).expectStatus().isOk();

		client.post().uri("/api/auth/refresh").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", RefreshCookies.valueOf(laptop))
			.exchange().expectStatus().isOk();
		var again = externalSignIn
			.signIn(new ExternalProfile("google", "g-ec9", "ec9-old@example.com", true, "Someone", null, "ec9-old@example.com"));
		assertThat(again.getId()).isEqualTo(google.getId());
		assertThat(again.email()).isEqualTo("ec9-new@example.com");
	}

	@Test
	void aResetCodeMailedToTheOldAddressStopsWorkingOnceTheEmailChanges() {
		var token = verifiedUser("ec12-old@example.com");
		// Registration spent the old address's send budget.
		clock.advance(Duration.ofSeconds(61));
		client.post().uri("/api/auth/password-reset").body(Map.of("email", "ec12-old@example.com"))
			.exchange().expectStatus().isNoContent();
		await().atMost(Duration.ofSeconds(10)).until(() -> RecordingMailer.sentTo("ec12-old@example.com").size() >= 2);
		var resetCode = RecordingMailer.lastCodeFor("ec12-old@example.com");

		request(token, "ec12-new@example.com").expectStatus().isNoContent();
		confirm(token, RecordingMailer.lastCodeFor("ec12-new@example.com")).expectStatus().isOk();

		client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", "ec12-new@example.com", "code", resetCode, "newPassword", "taken over"))
			.exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("code_expired");
		signIn("ec12-new@example.com").expectStatus().isOk();
	}

	@Test
	void anUnverifiedUserCantChangeTheirEmail() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "ec10@example.com", "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");

		request(token, "ec10-new@example.com").expectStatus().isForbidden().expectBody()
			.jsonPath("$.code").isEqualTo("email_unverified");
		confirm(token, "123456").expectStatus().isForbidden();
	}

	@Test
	void aSignedOutSessionCantChangeTheEmail() {
		var signedIn = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "ec11@example.com", "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult();
		String token = JsonPath.read(signedIn.getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, token, "ec11@example.com");
		request(token, "ec11-new@example.com").expectStatus().isNoContent();
		client.post().uri("/api/auth/logout").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", RefreshCookies.valueOf(signedIn))
			.exchange().expectStatus().is2xxSuccessful();

		request(token, "ec11-other@example.com").expectStatus().isUnauthorized();
		confirm(token, RecordingMailer.lastCodeFor("ec11-new@example.com")).expectStatus().isUnauthorized();
	}

	/** Registers and verifies a User, as they would from their inbox, and returns their access token. */
	private String verifiedUser(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

	private RestTestClient.ResponseSpec request(String token, String email) {
		return client.post().uri("/api/users/me/email-change").header("Authorization", "Bearer " + token)
			.body(Map.of("email", email))
			.exchange();
	}

	private RestTestClient.ResponseSpec confirm(String token, String code) {
		return client.post().uri("/api/users/me/email-change/confirm").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code))
			.exchange();
	}

	private RestTestClient.ResponseSpec me(String token) {
		return client.get().uri("/api/users/me").header("Authorization", "Bearer " + token).exchange();
	}

	private RestTestClient.ResponseSpec signIn(String email) {
		return client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", PASSWORD))
			.exchange();
	}

}
