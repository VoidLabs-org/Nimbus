package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One sign-in on one browser: a family of refresh tokens that replace each other. */
@Entity
@Table(name = "sessions")
class Session {

	@Id
	@GeneratedValue
	private UUID id;

	private UUID userId;

	private Instant startedAt;

	private Instant expiresAt;

	private Instant revokedAt;

	protected Session() {
	}

	Session(UUID userId, Instant startedAt, Instant expiresAt) {
		this.userId = userId;
		this.startedAt = startedAt;
		this.expiresAt = expiresAt;
	}

	UUID userId() {
		return userId;
	}

	/** When the session ends at the latest, however active it is. */
	Instant expiresAt() {
		return expiresAt;
	}

	boolean isRevoked() {
		return revokedAt != null;
	}

	void revoke(Instant now) {
		if (revokedAt == null) {
			revokedAt = now;
		}
	}

}
