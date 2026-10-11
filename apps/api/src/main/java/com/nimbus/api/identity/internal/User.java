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

	/** A User created from a provider login. The provider vouched for the email, so it starts verified. */
	static User fromProvider(String email, String displayName, String avatarUrl, Instant now) {
		var user = new User();
		user.id = UUID.randomUUID();
		user.email = email;
		user.displayName = displayName;
		user.avatarUrl = avatarUrl;
		user.emailVerified = true;
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

	void changeAvatar(String avatarUrl) {
		this.avatarUrl = avatarUrl;
	}

	/** A provider proved the User owns the email. */
	void verifyEmail() {
		this.emailVerified = true;
	}

	/** After this the User can only sign in with a Linked identity, until a password is set again. */
	void removePassword() {
		this.passwordHash = null;
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

	boolean emailVerified() {
		return emailVerified;
	}

	/** Null for Users who only sign in with a Linked identity. */
	String passwordHash() {
		return passwordHash;
	}

}
