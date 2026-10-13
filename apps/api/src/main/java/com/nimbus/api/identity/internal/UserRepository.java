package com.nimbus.api.identity.internal;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

interface UserRepository extends JpaRepository<User, UUID> {

	/** The User, or the 401 for a token that outlived them. */
	default User require(UUID id) {
		return findById(id)
			.orElseThrow(() -> new InvalidBearerTokenException("The User for this token no longer exists"));
	}

	/**
	 * The User's row, locked until the transaction ends. Whatever else changes the row meanwhile (a provider
	 * sign-in removing the password and ending the sessions) waits, or has finished before this returns.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.id = :id")
	Optional<User> findLockedById(@Param("id") UUID id);

	boolean existsByEmail(String email);

	Optional<User> findByEmail(String email);

}
