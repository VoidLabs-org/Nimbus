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
import java.util.HexFormat;

import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
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

	private final Clock clock;

	private final SlidingWindowLimiter attemptsByAddress;

	Sessions(SessionRepository sessions, RefreshTokenRepository tokens, UserRepository users,
			AuthProperties properties, Clock clock) {
		this.sessions = sessions;
		this.tokens = tokens;
		this.users = users;
		this.properties = properties;
		this.clock = clock;
		this.attemptsByAddress = new SlidingWindowLimiter(properties.refreshesPerAddress(), properties.limitWindow(),
				clock);
	}

	/** Starts a session for a User who just proved who they are, and returns its first refresh token. */
	@Transactional
	IssuedToken start(User user) {
		var now = now();
		var session = sessions.save(new Session(user.getId(), now, now.plus(properties.sessionMaxAge())));
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
		var attempt = attemptsByAddress.acquire(fromAddress, "Too many requests from this network. Try again later.");
		if (presented == null || presented.isBlank()) {
			throw new InvalidRefreshTokenException();
		}
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

	private IssuedToken issue(Session session, Instant now) {
		var bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		var value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		var idleExpiry = now.plus(properties.sessionIdleTimeout());
		var expiresAt = idleExpiry.isBefore(session.expiresAt()) ? idleExpiry : session.expiresAt();
		tokens.save(new RefreshToken(session, hash(value), now, expiresAt));
		return new IssuedToken(value, Duration.between(now, expiresAt));
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

	/** A refresh token to hand to the browser, and how long it keeps working. */
	record IssuedToken(String value, Duration lifetime) {
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
