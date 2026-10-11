package com.nimbus.api.identity.internal;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface LinkedIdentityRepository extends JpaRepository<LinkedIdentity, UUID> {

	Optional<LinkedIdentity> findByProviderAndProviderUserId(String provider, String providerUserId);

}
