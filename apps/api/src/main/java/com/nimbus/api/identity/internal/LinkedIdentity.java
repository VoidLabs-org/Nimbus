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

	protected LinkedIdentity() {
	}

	LinkedIdentity(UUID userId, String provider, String providerUserId, Instant createdAt) {
		this.userId = userId;
		this.provider = provider;
		this.providerUserId = providerUserId;
		this.createdAt = createdAt;
	}

	UUID userId() {
		return userId;
	}

}
