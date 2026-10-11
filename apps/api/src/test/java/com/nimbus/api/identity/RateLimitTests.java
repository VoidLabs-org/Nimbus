package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, RateLimitTests.MovableClockConfiguration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = "nimbus.auth.registrations-per-address=3")
@AutoConfigureRestTestClient
class RateLimitTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void fiveFailedSignInsForAnEmailBlockItUntilTheWindowEnds() {
		register("Ivan", "ivan@example.com");
		register("Judy", "judy@example.com");
		clock.advance(Duration.ofHours(1)); // past the registration window, so it can't interfere

		for (var attempt = 1; attempt <= 5; attempt++) {
			signIn("ivan@example.com", "wrong horse").expectStatus().isUnauthorized();
		}

		signIn("Ivan@example.com", "correct horse").expectStatus().isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
			.expectHeader().value("Retry-After", value -> assertThat(Long.parseLong(value)).isPositive());
		signIn("judy@example.com", "correct horse").expectStatus().isOk();

		clock.advance(Duration.ofMinutes(15));
		signIn("ivan@example.com", "correct horse").expectStatus().isOk();
	}

	// Password checks are slow, so parallel guesses would all pass a check that runs before counting.
	@Test
	void parallelWrongPasswordsCannotExceedTheLimit() throws Exception {
		clock.advance(Duration.ofHours(3));
		register("Olga", "olga@example.com");

		var attempts = 12;
		try (var pool = Executors.newFixedThreadPool(attempts)) {
			var statuses = new ArrayList<Future<Integer>>();
			for (var i = 0; i < attempts; i++) {
				statuses.add(pool.submit(() -> signIn("olga@example.com", "wrong horse")
					.expectBody(String.class).returnResult().getStatus().value()));
			}
			var unauthorized = 0;
			for (var status : statuses) {
				if (status.get() == 401) {
					unauthorized++;
				}
			}

			assertThat(unauthorized).isEqualTo(5);
		}
	}

	@Test
	void registrationsFromOneAddressAreLimited() {
		clock.advance(Duration.ofHours(2)); // a fresh window, whatever other tests registered
		register("Kim", "kim@example.com");
		register("Lee", "lee@example.com");
		register("Max", "max@example.com");

		registerRequest("Ned", "ned@example.com").expectStatus().isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
			.expectHeader().exists("Retry-After");

		clock.advance(Duration.ofMinutes(15));
		register("Ned", "ned@example.com");
	}

	private void register(String displayName, String email) {
		registerRequest(displayName, email).expectStatus().isCreated();
	}

	private RestTestClient.ResponseSpec registerRequest(String displayName, String email) {
		return client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", "correct horse"))
			.exchange();
	}

	private RestTestClient.ResponseSpec signIn(String email, String password) {
		return client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", password))
			.exchange();
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class MovableClockConfiguration {

		@Bean
		@Primary
		MovableClock movableClock() {
			return new MovableClock(Instant.now());
		}

	}

	/** Lets a test move time forward instead of waiting. */
	static class MovableClock extends Clock {

		private volatile Instant now;

		MovableClock(Instant start) {
			this.now = start;
		}

		void advance(Duration duration) {
			now = now.plus(duration);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

	}

}
