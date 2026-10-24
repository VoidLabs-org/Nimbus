package com.nimbus.api.identity.internal;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Browsers where a User ticked "Don't ask again on this device for 30 days" at the Sign-in code: their password and
 * Google or GitHub sign-ins skip the code there for a fixed {@link #LIFETIME} from when it was ticked, however often
 * the browser is used. The browser holds a random 256-bit token in the {@link #COOKIE} cookie; only its SHA-256 is
 * stored, bound to the User, so the cookie of one User never skips the code for another. Signing out keeps it; a
 * password change or reset, Remove and "Sign out all other devices" forget them.
 */
@Component
class RememberedBrowsers {

	static final String COOKIE = "two_step_remembered";

	static final Duration LIFETIME = Duration.ofDays(30);

	private static final SecureRandom RANDOM = new SecureRandom();

	private final JdbcTemplate jdbc;

	private final Clock clock;

	RememberedBrowsers(JdbcTemplate jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	/** Remembers a new browser of the User; returns its token, for {@link #cookie}. */
	String remember(UUID userId) {
		var bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		var token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		var now = now();
		jdbc.update("INSERT INTO remembered_browsers (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
				UUID.randomUUID(), userId, Sessions.hash(token), Timestamp.from(now), Timestamp.from(now.plus(LIFETIME)));
		return token;
	}

	/** Whether {@code token}, from the browser's cookie (null when there was none), remembers this User's browser. */
	boolean isRemembered(UUID userId, String token) {
		if (token == null || token.isBlank()) {
			return false;
		}
		var found = jdbc.queryForObject(
				"SELECT count(*) FROM remembered_browsers WHERE user_id = ? AND token_hash = ? AND expires_at > ?",
				Integer.class, userId, Sessions.hash(token), Timestamp.from(now()));
		return found != null && found > 0;
	}

	/** Every browser of the User asks for the code again. */
	void forgetAll(UUID userId) {
		jdbc.update("DELETE FROM remembered_browsers WHERE user_id = ?", userId);
	}

	/**
	 * Every browser of the User asks for the code again, except the one holding {@code keepToken} (null when the
	 * request had no cookie).
	 */
	void forgetAllExcept(UUID userId, String keepToken) {
		if (keepToken == null || keepToken.isBlank()) {
			forgetAll(userId);
			return;
		}
		jdbc.update("DELETE FROM remembered_browsers WHERE user_id = ? AND token_hash <> ?", userId,
				Sessions.hash(keepToken));
	}

	/** @return how many expired rows were deleted */
	int deleteExpired() {
		return jdbc.update("DELETE FROM remembered_browsers WHERE expires_at <= ?", Timestamp.from(now()));
	}

	/**
	 * HttpOnly and Secure. SameSite=Lax, so the browser sends it on the redirect back from Google or GitHub, and
	 * {@code Path=/api}, so "Sign out all other devices" receives it too.
	 */
	static ResponseCookie cookie(String token) {
		return ResponseCookie.from(COOKIE, token)
			.httpOnly(true)
			.secure(true)
			.sameSite("Lax")
			.path("/api")
			.maxAge(LIFETIME)
			.build();
	}

	// Postgres keeps microseconds, so times are cut to them before they are stored and compared.
	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
