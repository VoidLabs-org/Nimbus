package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface SessionRepository extends JpaRepository<Session, UUID> {

	/** Ends the User's sessions that are still running; ones that ended earlier keep their time. */
	@Modifying
	@Query("update Session s set s.revokedAt = :now where s.userId = :userId and s.revokedAt is null")
	void revokeAllOf(@Param("userId") UUID userId, @Param("now") Instant now);

}
