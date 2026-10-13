package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.RefreshCookies;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Sessions are created and used over HTTP with time moved by hand. The scheduler isn't waited for: the job's
 * entry point is called directly. Over HTTP a deleted session and an ended one both answer 401, so what was
 * removed is read from the tables. Registering starts a session too, so each User here has one more than they
 * signed in.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
// Its own application context, so its clock moves months ahead without affecting other test classes; the tiny
// batch size makes a handful of sessions take several deletes.
@TestPropertySource(properties = "nimbus.auth.session-cleanup-batch-size=2")
class SessionCleanupTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	SessionCleanup cleanup;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void aSessionThatEndedMoreThanSevenDaysAgoIsDeletedWithItsTokensAndOthersKeepWorking() {
		var user = register("clean@example.com");
		var signedOut = signedInToken("clean@example.com");
		var other = signedInToken("clean@example.com");
		refreshedToken(signedOut);
		logout(signedOut);
		assertThat(sessionsOf(user)).isEqualTo(3);

		clock.advance(Duration.ofDays(7).plusMinutes(1));
		var before = allSessions();
		var removed = cleanup.run();

		assertThat(removed).isGreaterThanOrEqualTo(1).isEqualTo(before - allSessions());
		assertThat(sessionsOf(user)).isEqualTo(2);
		assertThat(tokensOf(user)).isEqualTo(2);
		refresh(signedOut).expectStatus().isUnauthorized();
		refresh(other).expectStatus().isOk();
	}

	// What the scheduler calls, not run(): going through the registered task is what the hourly job really does.
	@Test
	void theRegisteredScheduledTaskDeletesEndedSessions() {
		var user = register("scheduled@example.com");
		logout(signedInToken("scheduled@example.com"));
		var registrar = new ScheduledTaskRegistrar();
		cleanup.configureTasks(registrar);
		clock.advance(Duration.ofDays(7).plusMinutes(1));

		registrar.getFixedDelayTaskList().getFirst().getRunnable().run();

		assertThat(sessionsOf(user)).isEqualTo(1);
	}

	// With batches of two, five ended sessions take three deletes.
	@Test
	void aBacklogLargerThanOneBatchIsClearedInFull() {
		var user = register("backlog@example.com");
		for (var i = 0; i < 5; i++) {
			logout(signedInToken("backlog@example.com"));
		}
		assertThat(sessionsOf(user)).isEqualTo(6);

		clock.advance(Duration.ofDays(7).plusMinutes(1));
		cleanup.run();

		assertThat(sessionsOf(user)).isEqualTo(1);
		assertThat(tokensOf(user)).isEqualTo(1);
	}

	@Test
	void aSessionThatEndedLessThanSevenDaysAgoIsKept() {
		var user = register("recent@example.com");
		var signedOut = signedInToken("recent@example.com");
		logout(signedOut);

		clock.advance(Duration.ofDays(7).minusMinutes(1));
		cleanup.run();

		assertThat(sessionsOf(user)).isEqualTo(2);
	}

	// Reuse detection needs the used tokens as long as the session lives, whatever their own expiry.
	@Test
	void anActiveSessionKeepsItsTokensEvenWhenTheyAreOlderThanTheRetention() {
		var user = register("active@example.com");
		var token = signedInToken("active@example.com");
		token = refreshedToken(token);
		token = refreshedToken(token);
		clock.advance(Duration.ofDays(29));
		token = refreshedToken(token);

		cleanup.run();

		assertThat(sessionsOf(user)).isEqualTo(2);
		assertThat(tokensOf(user)).isEqualTo(5);
		refresh(token).expectStatus().isOk();
	}

	// The 90-day cap ends a session without anyone revoking it; the week of retention counts from the cap.
	@Test
	void aSessionPastItsNinetyDayCapIsDeletedOnlyAfterTheRetention() {
		var user = register("cap@example.com");
		signedInToken("cap@example.com");

		clock.advance(Duration.ofDays(90).plusDays(6));
		cleanup.run();
		assertThat(sessionsOf(user)).isEqualTo(2);

		clock.advance(Duration.ofDays(1).plusMinutes(1));
		cleanup.run();
		assertThat(sessionsOf(user)).isZero();
		assertThat(tokensOf(user)).isZero();
	}

	private int allSessions() {
		return jdbc.queryForObject("select count(*) from sessions", Integer.class);
	}

	private int sessionsOf(UUID userId) {
		return jdbc.queryForObject("select count(*) from sessions where user_id = ?", Integer.class, userId);
	}

	private int tokensOf(UUID userId) {
		return jdbc.queryForObject(
				"select count(*) from refresh_tokens t join sessions s on s.id = t.session_id where s.user_id = ?",
				Integer.class, userId);
	}

	private UUID register(String email) {
		var body = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		return UUID.fromString(JsonPath.read(body, "$.user.id"));
	}

	private String signedInToken(String email) {
		var result = client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();
		return RefreshCookies.valueOf(result);
	}

	private String refreshedToken(String refreshToken) {
		var result = refresh(refreshToken).expectStatus().isOk().expectBody(String.class).returnResult();
		return RefreshCookies.valueOf(result);
	}

	private RestTestClient.ResponseSpec refresh(String refreshToken) {
		return client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange();
	}

	private void logout(String refreshToken) {
		client.post().uri("/api/auth/logout")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange()
			.expectStatus().isNoContent();
	}

}
