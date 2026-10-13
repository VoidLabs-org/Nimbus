package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

interface SessionRepository extends JpaRepository<Session, UUID> {

	/**
	 * Deletes at most {@code limit} sessions that ended before {@code cutoff}: revoked, or past their absolute cap.
	 * Their refresh tokens go with them (ON DELETE CASCADE). A session still running is never matched, whatever
	 * its tokens' age. Runs in its own short transaction, so a large backlog is cleared in small steps.
	 *
	 * @return how many sessions were deleted
	 */
	@Transactional
	@Modifying
	@Query(value = """
			delete from sessions where id in (
				select id from sessions where expires_at < :cutoff or revoked_at < :cutoff limit :limit)
			""", nativeQuery = true)
	int deleteEndedBefore(@Param("cutoff") Instant cutoff, @Param("limit") int limit);

	/** Ends the User's other sessions that are still running, so one browser stays signed in. */
	@Modifying
	@Query("update Session s set s.revokedAt = :now where s.userId = :userId and s.id <> :keep and s.revokedAt is null")
	void revokeAllOfExcept(@Param("userId") UUID userId, @Param("keep") UUID keep, @Param("now") Instant now);

	/** Ends the User's sessions that are still running; ones that ended earlier keep their time. */
	@Modifying
	@Query("update Session s set s.revokedAt = :now where s.userId = :userId and s.revokedAt is null")
	void revokeAllOf(@Param("userId") UUID userId, @Param("now") Instant now);

}
