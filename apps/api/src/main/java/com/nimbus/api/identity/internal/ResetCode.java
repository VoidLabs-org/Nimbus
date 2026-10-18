package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** The one live Reset code of a User, kept only as a keyed hash. */
@Entity
@Table(name = "reset_codes")
class ResetCode {

	@Id
	private UUID userId;

	private String codeHash;

	private Instant createdAt;

	private Instant expiresAt;

	private int wrongTries;

	protected ResetCode() {
	}

	ResetCode(UUID userId, String codeHash, Instant createdAt, Instant expiresAt) {
		this.userId = userId;
		this.codeHash = codeHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	/** A new code replaces the old one, and starts with no wrong tries. */
	void replaceWith(String codeHash, Instant createdAt, Instant expiresAt) {
		this.codeHash = codeHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
		this.wrongTries = 0;
	}

	void countWrongTry() {
		wrongTries++;
	}

	boolean isExpiredAt(Instant now) {
		return !now.isBefore(expiresAt);
	}

	String codeHash() {
		return codeHash;
	}

	int wrongTries() {
		return wrongTries;
	}

}
