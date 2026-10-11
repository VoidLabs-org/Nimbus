package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** One refresh token of a {@link Session}, stored only as a hash. It can be exchanged once. */
@Entity
@Table(name = "refresh_tokens")
class RefreshToken {

	@Id
	@GeneratedValue
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id")
	private Session session;

	private String tokenHash;

	private Instant issuedAt;

	private Instant expiresAt;

	private Instant usedAt;

	protected RefreshToken() {
	}

	RefreshToken(Session session, String tokenHash, Instant issuedAt, Instant expiresAt) {
		this.session = session;
		this.tokenHash = tokenHash;
		this.issuedAt = issuedAt;
		this.expiresAt = expiresAt;
	}

	Session session() {
		return session;
	}

	Instant expiresAt() {
		return expiresAt;
	}

	boolean isUsed() {
		return usedAt != null;
	}

	void markUsed(Instant now) {
		usedAt = now;
	}

}
