package com.nimbus.api.identity.internal;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

	/** Locks the row, so two requests presenting the same token are handled one after the other. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<RefreshToken> findByTokenHash(String tokenHash);

}
