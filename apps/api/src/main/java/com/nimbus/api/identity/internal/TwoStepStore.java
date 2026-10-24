package com.nimbus.api.identity.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
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

	/** Marks the User's unused Recovery code with this hash used. @return false when there is none */
	boolean useRecoveryCode(UUID userId, String hash, Instant usedAt) {
		return jdbc.update("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
				Timestamp.from(usedAt), userId, hash) == 1;
	}

	int recoveryCodesLeft(UUID userId) {
		var left = jdbc.queryForObject("SELECT count(*) FROM recovery_codes WHERE user_id = ? AND used_at IS NULL",
				Integer.class, userId);
		return left == null ? 0 : left;
	}

	record Authenticator(byte[] encryptedKey, Instant enabledAt, Long lastUsedStep) {
	}

}
