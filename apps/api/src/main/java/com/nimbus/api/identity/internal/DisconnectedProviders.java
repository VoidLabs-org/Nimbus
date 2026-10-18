package com.nimbus.api.identity.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The providers a User has disconnected. While a provider is marked, a sign-in with it on the User's email links
 * nothing and is refused (ADR 0004). The mark is per provider, not per provider account.
 */
@Component
class DisconnectedProviders {

	private final JdbcTemplate jdbc;

	DisconnectedProviders(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	boolean isMarked(UUID userId, String provider) {
		return Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT EXISTS (SELECT 1 FROM disconnected_providers WHERE user_id = ? AND provider = ?)",
				Boolean.class, userId, provider));
	}

	/** Forgets the mark, as connecting the provider again does. */
	void clear(UUID userId, String provider) {
		jdbc.update("DELETE FROM disconnected_providers WHERE user_id = ? AND provider = ?", userId, provider);
	}

	/** Marks the provider, or moves the time of the mark it already has. */
	void mark(UUID userId, String provider, Instant at) {
		jdbc.update("""
				INSERT INTO disconnected_providers (user_id, provider, disconnected_at) VALUES (?, ?, ?)
				ON CONFLICT (user_id, provider) DO UPDATE SET disconnected_at = EXCLUDED.disconnected_at
				""", userId, provider, Timestamp.from(at));
	}

}
