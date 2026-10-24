package com.nimbus.api.identity.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** The stored side of Two-step verification: each User's authenticator and their Recovery codes. */
@Component
class TwoStepStore {

	private final JdbcTemplate jdbc;

	TwoStepStore(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	Optional<Authenticator> find(UUID userId) {
		return jdbc.query("SELECT encrypted_key, enabled_at, last_used_step FROM two_step_authenticators WHERE user_id = ?",
				(row, n) -> new Authenticator(row.getBytes("encrypted_key"), row.getTimestamp("enabled_at").toInstant(),
						row.getObject("last_used_step", Long.class)),
				userId).stream().findFirst();
	}

	void add(UUID userId, byte[] encryptedKey, Instant enabledAt, long lastUsedStep) {
		jdbc.update("INSERT INTO two_step_authenticators (user_id, encrypted_key, enabled_at, last_used_step) VALUES (?, ?, ?, ?)",
				userId, encryptedKey, Timestamp.from(enabledAt), lastUsedStep);
	}

	/** Deletes the User's authenticator and all their Recovery codes. */
	void remove(UUID userId) {
		jdbc.update("DELETE FROM recovery_codes WHERE user_id = ?", userId);
		jdbc.update("DELETE FROM two_step_authenticators WHERE user_id = ?", userId);
	}

	/** Keeps {@code step} as the newest that signed the User in, so its code and older ones are refused from now on. */
	void useStep(UUID userId, long step) {
		jdbc.update("UPDATE two_step_authenticators SET last_used_step = ? WHERE user_id = ?", step, userId);
	}

	/** Replaces the User's Recovery codes with these hashes. */
	void replaceRecoveryCodes(UUID userId, List<String> hashes) {
		jdbc.update("DELETE FROM recovery_codes WHERE user_id = ?", userId);
		jdbc.batchUpdate("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)", hashes, hashes.size(),
				(statement, hash) -> {
					statement.setObject(1, UUID.randomUUID());
					statement.setObject(2, userId);
					statement.setString(3, hash);
				});
	}

	/**
	 * Marks the User's unused Recovery code with this hash used, in one round trip.
	 *
	 * @return the User's unused Recovery codes left after it; empty when there was no such code
	 */
	OptionalInt useRecoveryCode(UUID userId, String hash, Instant usedAt) {
		// The outer query still sees the rows as they were before the update, so the code just used is taken off.
		return jdbc.queryForObject("""
				WITH used AS (
				    UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL RETURNING id
				)
				SELECT (SELECT count(*) FROM used) AS used,
				       (SELECT count(*) FROM recovery_codes WHERE user_id = ? AND used_at IS NULL) AS unused
				""", (row, n) -> row.getInt("used") == 0 ? OptionalInt.empty()
				: OptionalInt.of(row.getInt("unused") - 1), Timestamp.from(usedAt), userId, hash, userId);
	}

	int recoveryCodesLeft(UUID userId) {
		var left = jdbc.queryForObject("SELECT count(*) FROM recovery_codes WHERE user_id = ? AND used_at IS NULL",
				Integer.class, userId);
		return left == null ? 0 : left;
	}

	record Authenticator(byte[] encryptedKey, Instant enabledAt, Long lastUsedStep) {
	}

}
