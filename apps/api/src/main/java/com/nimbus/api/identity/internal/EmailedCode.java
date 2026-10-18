package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

/** The one live code of a kind (Verification, Reset) of a User, kept only as a keyed hash. */
@Entity
@Table(name = "emailed_codes")
class EmailedCode implements Persistable<EmailedCode.Key> {

	@EmbeddedId
	private Key id;

	// We assign ids ourselves, so tell Spring Data which codes are new (insert, not select and merge).
	@Transient
	private boolean isNew;

	private String codeHash;

	private Instant createdAt;

	private Instant expiresAt;

	private int wrongTries;

	protected EmailedCode() {
	}

	EmailedCode(UUID userId, EmailedCodes.Kind kind, String codeHash, Instant createdAt, Instant expiresAt) {
		this.id = new Key(userId, kind);
		this.codeHash = codeHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
		this.isNew = true;
	}

	@PostPersist
	@PostLoad
	void markNotNew() {
		isNew = false;
	}

	@Override
	public Key getId() {
		return id;
	}

	@Override
	public boolean isNew() {
		return isNew;
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

	@Embeddable
	record Key(UUID userId, @Enumerated(EnumType.STRING) EmailedCodes.Kind kind) {
	}

}
