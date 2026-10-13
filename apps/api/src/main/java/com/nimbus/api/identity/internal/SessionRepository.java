package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface SessionRepository extends JpaRepository<Session, UUID> {

	/**
	 * Deletes sessions that ended before {@code cutoff}: revoked, or past their absolute cap. Their refresh tokens
	 * go with them (ON DELETE CASCADE). A session still running is never matched, whatever its tokens' age.
	 *
	 * @return how many sessions were deleted
	 */
	@Modifying
	@Query("delete from Session s where s.expiresAt < :cutoff or s.revokedAt < :cutoff")
	int deleteEndedBefore(@Param("cutoff") Instant cutoff);

	/** Ends the User's other sessions that are still running, so one browser stays signed in. */
	@Modifying
	@Query("update Session s set s.revokedAt = :now where s.userId = :userId and s.id <> :keep and s.revokedAt is null")
	void revokeAllOfExcept(@Param("userId") UUID userId, @Param("keep") UUID keep, @Param("now") Instant now);

	/** Ends the User's sessions that are still running; ones that ended earlier keep their time. */
	@Modifying
	@Query("update Session s set s.revokedAt = :now where s.userId = :userId and s.revokedAt is null")
	void revokeAllOf(@Param("userId") UUID userId, @Param("now") Instant now);

}
