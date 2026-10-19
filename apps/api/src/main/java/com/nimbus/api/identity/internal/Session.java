package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

/**
 * One sign-in on one browser: a family of refresh tokens that replace each other.
 *
 * <p>
 * Updates write only the columns that changed. A refresh loads the session, then marks it active; if it wrote every
 * column, it would put back the {@code revoked_at} that a bulk revoke ("sign out all other devices", a password
 * change) committed in between, and the session would stay signed in.
 */
@Entity
@DynamicUpdate
@Table(name = "sessions")
class Session {

	/** The column's width; a longer header is cut. */
	static final int MAX_USER_AGENT = 512;

	@Id
	@GeneratedValue
	private UUID id;

	private UUID userId;

	private Instant startedAt;

	private Instant expiresAt;

	private Instant revokedAt;

	private String userAgent;

	/** When it last got a new refresh token: its start, then every refresh. */
	private Instant lastActiveAt;

	protected Session() {
	}

	/** @param userAgent the browser's {@code User-Agent} header, or null when it sent none */
	Session(UUID userId, Instant startedAt, Instant expiresAt, String userAgent) {
		this.userId = userId;
		this.userAgent = userAgent == null ? null : cut(userAgent);
		this.startedAt = startedAt;
		this.lastActiveAt = startedAt;
		this.expiresAt = expiresAt;
	}

	/** At most {@link #MAX_USER_AGENT} characters, never ending between the two halves of one character. */
	private static String cut(String userAgent) {
		if (userAgent.length() <= MAX_USER_AGENT) {
			return userAgent;
		}
		var end = Character.isHighSurrogate(userAgent.charAt(MAX_USER_AGENT - 1)) ? MAX_USER_AGENT - 1
				: MAX_USER_AGENT;
		return userAgent.substring(0, end);
	}

	UUID id() {
		return id;
	}

	Instant startedAt() {
		return startedAt;
	}

	UUID userId() {
		return userId;
	}

	String userAgent() {
		return userAgent;
	}

	/** When the session ends at the latest, however active it is. */
	Instant expiresAt() {
		return expiresAt;
	}

	/** Not revoked and not past its absolute cap. */
	boolean isActiveAt(Instant now) {
		return revokedAt == null && now.isBefore(expiresAt);
	}

	void markActive(Instant now) {
		lastActiveAt = now;
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
