package com.nimbus.api.identity.internal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps Users signed in with refresh tokens: opaque random values, stored only as hashes. Each sign-in starts a
 * {@link Session}.
 */
@Service
class Sessions {

	private static final SecureRandom RANDOM = new SecureRandom();

	private final SessionRepository sessions;

	private final RefreshTokenRepository tokens;

	private final UserRepository users;

	private final AuthProperties properties;

	private final DeviceLabels deviceLabels;

	private final Clock clock;

	private final SlidingWindowLimiter attemptsByAddress;

	Sessions(SessionRepository sessions, RefreshTokenRepository tokens, UserRepository users,
			AuthProperties properties, DeviceLabels deviceLabels, Clock clock) {
		this.sessions = sessions;
		this.tokens = tokens;
		this.users = users;
		this.properties = properties;
		this.deviceLabels = deviceLabels;
		this.clock = clock;
		this.attemptsByAddress = new SlidingWindowLimiter(properties.refreshesPerAddress(), properties.limitWindow(),
				clock);
	}

	/**
	 * Starts a session for a User who just proved who they are, and returns its first refresh token.
	 *
	 * @param userAgent the browser's {@code User-Agent} header, kept to tell the User's sessions apart; may be null
	 */
	@Transactional
	IssuedToken start(User user, String userAgent) {
		var now = now();
		var session = sessions
			.save(new Session(user.getId(), now, now.plus(properties.sessionMaxAge()), userAgent));
		return issue(session, now);
	}

	/**
	 * Exchanges a refresh token for a new one in the same session. A token works once: presenting a used one
	 * means it was copied, so the whole session ends. The revocation is kept although the exception is thrown.
	 *
	 * @param presented the refresh token from the cookie, or null when there was none
	 * @param fromAddress the caller's IP address; failed attempts from it count toward a coarse limit, while
	 * successes are taken back, since everyone behind one network address shares it
	 * @throws LimitExceededException when this address failed to refresh too often recently
	 * @throws InvalidRefreshTokenException when the token is missing, unknown, used, expired or its session ended
	 */
	@Transactional(noRollbackFor = InvalidRefreshTokenException.class)
	Refreshed refresh(String presented, String fromAddress) {
		// The web app asks on every load, signed in or not. A request without a cookie costs nothing and
		// proves nothing, so it must not use up the limit that signed-in Users on the same network share.
		if (presented == null || presented.isBlank()) {
			throw new InvalidRefreshTokenException();
		}
		var attempt = attemptsByAddress.acquire(fromAddress, "Too many requests from this network. Try again later.");
		var now = now();
		var token = tokens.findByTokenHash(hash(presented)).orElseThrow(InvalidRefreshTokenException::new);
		var session = token.session();
		if (token.isUsed()) {
			session.revoke(now);
			throw new InvalidRefreshTokenException();
		}
		if (session.isRevoked() || !now.isBefore(token.expiresAt())) {
			throw new InvalidRefreshTokenException();
		}
		var user = users.findById(session.userId()).orElseThrow(InvalidRefreshTokenException::new);
		token.markUsed(now);
		var refreshed = new Refreshed(user, issue(session, now));
		attemptsByAddress.release(fromAddress, attempt);
		return refreshed;
	}

	/**
	 * Ends the session a refresh token belongs to, whether or not that token is still the current one. Does
	 * nothing when the token is missing or unknown or its session is already over, so signing out never fails.
	 */
	@Transactional
	void end(String presented) {
		if (presented == null || presented.isBlank()) {
			return;
		}
		tokens.findByTokenHash(hash(presented)).ifPresent(token -> token.session().revoke(now()));
	}

	/** Ends every session of a User, on every browser. Their access tokens still work until they expire. */
	@Transactional
	void endAll(User user) {
		sessions.revokeAllOf(user.getId(), now());
	}

	/** Whether the session is the User's own and still running. */
	@Transactional(readOnly = true)
	boolean isActive(UUID sessionId, UUID userId) {
		return isActiveAt(sessionId, userId, now());
	}

	private boolean isActiveAt(UUID sessionId, UUID userId, Instant now) {
		return sessions.findById(sessionId)
			.filter(session -> session.userId().equals(userId) && session.isActiveAt(now))
			.isPresent();
	}

	/**
	 * The User's running sessions, the one making the request first, then the rest by when they were last used.
	 *
	 * @param currentSessionId the session of the access token making the request
	 * @throws InvalidBearerTokenException when that session has ended: a signed-out browser whose access token still
	 * works must not see or change the User's other sessions
	 */
	@Transactional(readOnly = true)
	List<SessionView> listFor(UUID userId, UUID currentSessionId) {
		// One instant for both questions, so a session ending between them can't be running for one and over for the other.
		var now = now();
		if (!isActiveAt(currentSessionId, userId, now)) {
			throw new InvalidBearerTokenException("Your session has ended. Sign in again.");
		}
		var views = sessions.findRunningOf(userId, now)
			.stream()
			.map(session -> new SessionView(session.getId(), deviceLabels.of(session.getUserAgent()),
					session.getId().equals(currentSessionId), session.getStartedAt(), session.getLastActiveAt()))
			.sorted(Comparator.comparing(SessionView::current).reversed()
				.thenComparing(SessionView::lastActiveAt, Comparator.reverseOrder()))
			.toList();
		// The caller's own session must be in its list; if it isn't, it ended in the meantime.
		if (views.stream().noneMatch(SessionView::current)) {
			throw new InvalidBearerTokenException("Your session has ended. Sign in again.");
		}
		return views;
	}

	/** Ends every session of a User except one, on every other browser. */
	@Transactional
	void endAllExcept(UUID userId, UUID keepSessionId) {
		sessions.revokeAllOfExcept(userId, keepSessionId, now());
	}

	private IssuedToken issue(Session session, Instant now) {
		var bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		var value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		var idleExpiry = now.plus(properties.sessionIdleTimeout());
		var expiresAt = idleExpiry.isBefore(session.expiresAt()) ? idleExpiry : session.expiresAt();
		tokens.save(new RefreshToken(session, hash(value), now, expiresAt));
		return new IssuedToken(value, Duration.between(now, expiresAt), session.id());
	}

	// Postgres keeps microseconds and rounds anything finer, which could push a stored expiry past the instant
	// it should end at. Cutting times to microseconds first keeps stored and compared times the same.
	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	// A plain SHA-256 is enough: the token is 256 random bits, so there is nothing to brute-force.
	private static String hash(String token) {
		try {
			var digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** One row of the User's list of sessions. */
	record SessionView(UUID id, String device, boolean current, Instant startedAt, Instant lastActiveAt) {
	}

	/** A refresh token to hand to the browser, how long it keeps working, and the session it belongs to. */
	record IssuedToken(String value, Duration lifetime, UUID sessionId) {
	}

	/** The session's User and the refresh token that replaces the presented one. */
	record Refreshed(User user, IssuedToken token) {
	}

	/** The same for every reason, so a caller learns nothing about which tokens exist. */
	static class InvalidRefreshTokenException extends RuntimeException {

		InvalidRefreshTokenException() {
			super("Your session has ended. Sign in again.");
		}

	}

}
