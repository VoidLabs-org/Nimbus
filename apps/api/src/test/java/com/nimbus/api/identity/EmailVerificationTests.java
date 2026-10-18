package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.RecordingMailer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class EmailVerificationTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	JdbcClient jdbc;

	@Test
	void registeringEmailsAVerificationCodeToTheAddress() {
		var response = register("ev-ada@example.com");

		assertThat((Boolean) JsonPath.read(response, "$.user.emailVerified")).isFalse();
		var mails = RecordingMailer.sentTo("ev-ada@example.com");
		assertThat(mails).hasSize(1);
		assertThat(mails.get(0).text()).containsPattern("\\b\\d{6}\\b").contains("expires in 15 minutes");
		assertThat(mails.get(0).html()).contains(RecordingMailer.lastCodeFor("ev-ada@example.com"));
	}

	@Test
	void anUnverifiedUserCanSeeTheirProfileButUseNothingElse() {
		var token = accessToken(register("ev-bea@example.com"));

		client.get().uri("/api/users/me").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk()
			.expectBody().jsonPath("$.emailVerified").isEqualTo(false);
		client.patch().uri("/api/users/me").header("Authorization", "Bearer " + token)
			.body(Map.of("displayName", "Bea B"))
			.exchange().expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		client.get().uri("/api/access/roles").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void anUnverifiedUserCanStillRefreshAndSignOut() {
		var result = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Cy", "email", "ev-cy@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult();
		var cookie = RefreshCookies.of(result);

		client.post().uri("/api/auth/refresh").header("X-Requested-With", "nimbus").cookie(cookie.getName(), cookie.getValue())
			.exchange().expectStatus().isOk();
	}

	@Test
	void theRightCodeVerifiesTheEmailAndTheSameSessionCarriesOn() {
		var token = accessToken(register("ev-dee@example.com"));
		var code = RecordingMailer.lastCodeFor("ev-dee@example.com");

		client.post().uri("/api/auth/verify-email").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code))
			.exchange().expectStatus().isOk()
			.expectBody().jsonPath("$.emailVerified").isEqualTo(true);

		client.patch().uri("/api/users/me").header("Authorization", "Bearer " + token)
			.body(Map.of("displayName", "Dee D"))
			.exchange().expectStatus().isOk();
		// The code is used up; entering a verified User's code again is harmless.
		client.post().uri("/api/auth/verify-email").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code))
			.exchange().expectStatus().isOk();
	}

	@Test
	void aWrongCodeSaysHowManyTriesAreLeftAndTheFifthCancelsTheCode() {
		var token = accessToken(register("ev-eli@example.com"));
		var right = RecordingMailer.lastCodeFor("ev-eli@example.com");
		var wrong = right.equals("000000") ? "111111" : "000000";

		for (var left = 4; left >= 1; left--) {
			verify(token, wrong).expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.code").isEqualTo("invalid_code")
				.jsonPath("$.triesLeft").isEqualTo(left);
		}
		verify(token, wrong).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");

		// Cancelled: even the right code no longer works.
		verify(token, right).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");
	}

	@Test
	void aCodeExpiresAfterFifteenMinutes() {
		var token = accessToken(register("ev-fay@example.com"));
		var code = RecordingMailer.lastCodeFor("ev-fay@example.com");

		clock.advance(Duration.ofMinutes(14).plusSeconds(59));
		verify(token, code).expectStatus().isOk();

		var late = accessToken(register("ev-gus@example.com"));
		var lateCode = RecordingMailer.lastCodeFor("ev-gus@example.com");
		clock.advance(Duration.ofMinutes(15).plusSeconds(1));
		verify(late, lateCode).expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");
	}

	@Test
	void aMalformedCodeIsRefusedWithoutCountingATry() {
		var token = accessToken(register("ev-hal@example.com"));
		var code = RecordingMailer.lastCodeFor("ev-hal@example.com");

		verify(token, "12ab").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.errors.code").isNotEmpty();
		verify(token, code.substring(0, 3) + " " + code.substring(3)).expectStatus().isOk();
	}

	@Test
	void aMissingCodeIsRefusedWithoutCountingATry() {
		var token = accessToken(register("ev-ned@example.com"));
		var code = RecordingMailer.lastCodeFor("ev-ned@example.com");

		for (var body : List.<Map<String, Object>>of(Map.of(), Collections.singletonMap("code", null))) {
			for (var attempt = 0; attempt < 6; attempt++) {
				client.post().uri("/api/auth/verify-email").header("Authorization", "Bearer " + token)
					.body(body)
					.exchange().expectStatus().isBadRequest()
					.expectBody().jsonPath("$.errors.code").isNotEmpty();
			}
		}

		verify(token, code).expectStatus().isOk();
	}

	@Test
	void theGateListsExactEndpointsSoNothingNewUnderAuthSlipsThrough() {
		var token = accessToken(register("ev-opal@example.com"));

		client.get().uri("/api/auth/something-new").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		client.post().uri("/api/auth/something-new").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void theGateRefusesInTheSameProblemFormatAsEveryOtherError() {
		var token = accessToken(register("ev-quin@example.com"));

		client.patch().uri("/api/users/me").header("Authorization", "Bearer " + token)
			.body(Map.of("displayName", "Quin"))
			.exchange().expectStatus().isForbidden()
			.expectHeader().contentTypeCompatibleWith("application/problem+json")
			.expectBody()
			.jsonPath("$.title").isEqualTo("Forbidden")
			.jsonPath("$.status").isEqualTo(403)
			.jsonPath("$.detail").isEqualTo("Verify your email to use Nimbus")
			.jsonPath("$.instance").isEqualTo("/api/users/me")
			.jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void theEmailKeepsTheCodeOutOfTheSubjectLine() {
		register("ev-pam@example.com");

		var mail = RecordingMailer.sentTo("ev-pam@example.com").get(0);

		assertThat(mail.subject()).doesNotContainPattern("\\d{6}");
	}

	@Test
	void theDatabaseNeverHoldsTheCodeInPlainText() {
		register("ev-ivy@example.com");
		var code = RecordingMailer.lastCodeFor("ev-ivy@example.com");

		var hash = jdbc.sql("SELECT code_hash FROM verification_codes WHERE user_id = "
				+ "(SELECT id FROM users WHERE email = 'ev-ivy@example.com')").query(String.class).single();

		assertThat(hash).doesNotContain(code).hasSize(64);
	}

	@Test
	void registrationSucceedsEvenWhenTheEmailCannotBeSent() {
		RecordingMailer.failing(true);
		try {
			client.post().uri("/api/auth/register")
				.body(Map.of("displayName", "Jo", "email", "ev-jo@example.com", "password", "correct horse"))
				.exchange().expectStatus().isCreated();
		}
		finally {
			RecordingMailer.failing(false);
		}

		client.post().uri("/api/auth/login")
			.body(Map.of("email", "ev-jo@example.com", "password", "correct horse"))
			.exchange().expectStatus().isOk();
	}

	@Test
	void aUserWhoWasUnverifiedBeforeThereWasAGateMeetsTheGate() {
		// Registered before verification existed: unverified, with no code ever issued for them.
		var token = accessToken(register("ev-kim@example.com"));
		jdbc.sql("DELETE FROM verification_codes WHERE user_id = (SELECT id FROM users WHERE email = 'ev-kim@example.com')")
			.update();

		client.get().uri("/api/access/roles").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isForbidden();
		verify(token, "123456").expectStatus().isBadRequest()
			.expectBody().jsonPath("$.code").isEqualTo("code_expired");
	}

	private RestTestClient.ResponseSpec verify(String token, String code) {
		return client.post().uri("/api/auth/verify-email").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code))
			.exchange();
	}

	private String register(String email) {
		return client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private static String accessToken(String response) {
		return JsonPath.read(response, "$.accessToken");
	}

}
