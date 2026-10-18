package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.List;
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

	/**
	 * The User's sessions that can still be used: not revoked, before their cap, and with a refresh token not yet
	 * expired. Tokens of a session expire in the order they were issued, so the newest one decides. A session idle
	 * for 30 days is over in practice, although its row stays until the cap.
	 */
	@Query("""
			select s.id as id, s.userAgent as userAgent, s.startedAt as startedAt, max(t.issuedAt) as lastActiveAt
			from RefreshToken t join t.session s
			where s.userId = :userId and s.revokedAt is null and s.expiresAt > :now
			group by s.id, s.userAgent, s.startedAt
			having max(t.expiresAt) > :now
			""")
	List<RunningSession> findRunningOf(@Param("userId") UUID userId, @Param("now") Instant now);

	/** A running session with when it was last used: the newest refresh token's issue time. */
	interface RunningSession {

		UUID getId();

		String getUserAgent();

		Instant getStartedAt();

		Instant getLastActiveAt();

	}

}
