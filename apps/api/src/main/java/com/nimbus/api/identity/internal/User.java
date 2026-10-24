package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

	// When the password was last set; null without one, and for passwords set before this was kept.
	private Instant passwordChangedAt;

	private Instant createdAt;

	protected User() {
	}

	/** A User who signed up with a password. Nothing has proved they own the email yet, so it starts unverified. */
	static User withPassword(String email, String displayName, String passwordHash, Instant now) {
		var user = new User();
		user.id = UUID.randomUUID();
		user.email = email;
		user.displayName = displayName;
		user.passwordHash = passwordHash;
		user.passwordChangedAt = micros(now);
		user.createdAt = now;
		user.isNew = true;
		return user;
	}

	/** A User the operator vouches for, e.g. the admin seed: the email is verified from the start. */
	static User verifiedWithPassword(String email, String displayName, String passwordHash, Instant now) {
		var user = withPassword(email, displayName, passwordHash, now);
		user.emailVerified = true;
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

	/** The User proved they own {@code email} (lower-cased) with the code mailed there, so it stays verified. */
	void changeEmail(String email) {
		this.email = email;
		this.emailVerified = true;
	}

	/** A provider proved the User owns the email. */
	void verifyEmail() {
		this.emailVerified = true;
	}

	/** @param passwordHash an already hashed password */
	void changePassword(String passwordHash, Instant now) {
		this.passwordHash = passwordHash;
		this.passwordChangedAt = micros(now);
	}

	/** After this the User can only sign in with a Linked identity, until a password is set again. */
	void removePassword() {
		this.passwordHash = null;
		this.passwordChangedAt = null;
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

	/** Null without a password, and for one set before Nimbus kept the time. */
	Instant passwordChangedAt() {
		return passwordChangedAt;
	}

	// Postgres keeps microseconds and rounds anything finer, so what is read back equals what was set.
	private static Instant micros(Instant instant) {
		return instant.truncatedTo(ChronoUnit.MICROS);
	}

	/** Null for Users who only sign in with a Linked identity. */
	String passwordHash() {
		return passwordHash;
	}

}
