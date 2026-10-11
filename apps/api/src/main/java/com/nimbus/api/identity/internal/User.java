package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

/** A person who can sign in to Nimbus, identified by their (lower-cased) email. */
@Entity
@Table(name = "users")
class User implements Persistable<UUID> {

	@Id
	private UUID id;

	// We assign ids ourselves, so tell Spring Data which Users are new (insert, not merge).
	@Transient
	private boolean isNew;

	private String email;

	private String displayName;

	private String passwordHash;

	private String avatarUrl;

	private boolean emailVerified;

	private Instant createdAt;

	protected User() {
	}

	static User withPassword(String email, String displayName, String passwordHash, Instant now) {
		var user = new User();
		user.id = UUID.randomUUID();
		user.email = email;
		user.displayName = displayName;
		user.passwordHash = passwordHash;
		user.createdAt = now;
		user.isNew = true;
		return user;
	}

	@PostPersist
	@PostLoad
	void markNotNew() {
		isNew = false;
	}

	@Override
	public UUID getId() {
		return id;
	}

	@Override
	public boolean isNew() {
		return isNew;
	}

	void rename(String displayName) {
		this.displayName = displayName;
	}

	String email() {
		return email;
	}

	String displayName() {
		return displayName;
	}

	String avatarUrl() {
		return avatarUrl;
	}

	/** Null for Users who only sign in with a Linked identity. */
	String passwordHash() {
		return passwordHash;
	}

}
