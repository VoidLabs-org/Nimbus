package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A Google or GitHub login attached to a User, identified by the provider's own id for the person. */
@Entity
@Table(name = "linked_identities")
class LinkedIdentity {

	@Id
	@GeneratedValue
	private UUID id;

	private UUID userId;

	private String provider;

	private String providerUserId;

	private Instant createdAt;

	/** The Google email or GitHub username to show the User; null for an identity linked before it was kept. */
	private String accountName;

	/** The picture the provider last sent for the person, or null when it sent none yet. Not copied into storage. */
	private String pictureUrl;

	protected LinkedIdentity() {
	}

	LinkedIdentity(UUID userId, String provider, String providerUserId, String accountName, String pictureUrl,
			Instant createdAt) {
		this.userId = userId;
		this.provider = provider;
		this.providerUserId = providerUserId;
		this.accountName = accountName;
		this.pictureUrl = pictureUrl;
		this.createdAt = createdAt;
	}

	UUID userId() {
		return userId;
	}

	String provider() {
		return provider;
	}

	String accountName() {
		return accountName;
	}

	String pictureUrl() {
		return pictureUrl;
	}

	Instant createdAt() {
		return createdAt;
	}

	/** Follows a rename at the provider; a sign-in that brings no name leaves the one we have. */
	void refreshAccountName(String accountName) {
		if (accountName != null) {
			this.accountName = accountName;
		}
	}

	/** Follows a change of picture at the provider; a sign-in that brings none leaves the one we have. */
	void refreshPicture(String pictureUrl) {
		if (pictureUrl != null) {
			this.pictureUrl = pictureUrl;
		}
	}

}
