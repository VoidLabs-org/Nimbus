package com.nimbus.api.identity.internal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * The one-time codes a provider sign-in started by one of the apps hands back to it (the Desktop app, ADR 0008, or
 * the Mobile app). A code stands for who the provider vouched for, nothing more: no Session, no link, until the app
 * trades it in. It is random,
 * lasts {@link #LIFETIME} (it only has to get from the browser to the app), works once, and only together with the
 * verifier whose hash the app gave at the start (RFC 7636 S256), so a program that sees the code going by can't use
 * it. Kept in memory only, like {@link LinkTickets}: a restart just means signing in again.
 */
@Component
class AppCodes {

	static final Duration LIFETIME = Duration.ofSeconds(60);

	private static final int BYTES = 32;

	/** RFC 7636's limits for a verifier. */
	private static final int MIN_VERIFIER = 43;

	private static final int MAX_VERIFIER = 128;

	private final ConcurrentHashMap<String, Handoff> issued = new ConcurrentHashMap<>();

	private final SecureRandom random = new SecureRandom();

	private final Clock clock;

	AppCodes(Clock clock) {
		this.clock = clock;
	}

	/**
	 * A new code for what the provider sent.
	 *
	 * @param linkTicket the ticket of a connect from the Security page; null for a sign-in
	 */
	String issue(String challenge, ExternalProfile profile, String linkTicket) {
		var now = clock.instant();
		issued.values().removeIf(handoff -> !handoff.expiresAt().isAfter(now));
		var bytes = new byte[BYTES];
		random.nextBytes(bytes);
		var code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		issued.put(code, new Handoff(challenge, profile, linkTicket, now.plus(LIFETIME)));
		return code;
	}

	/**
	 * Takes the code back, so it can't be used again, whether or not the verifier fits; empty when it is unknown, used,
	 * expired, or the verifier is not the one the start gave the hash of.
	 */
	Optional<Handoff> take(String code, String verifier) {
		if (code == null || verifier == null || verifier.length() < MIN_VERIFIER || verifier.length() > MAX_VERIFIER) {
			if (code != null) {
				issued.remove(code);
			}
			return Optional.empty();
		}
		return Optional.ofNullable(issued.remove(code))
			.filter(found -> found.expiresAt().isAfter(clock.instant()))
			.filter(found -> MessageDigest.isEqual(found.challenge().getBytes(StandardCharsets.US_ASCII),
					challengeOf(verifier).getBytes(StandardCharsets.US_ASCII)));
	}

	private static String challengeOf(String verifier) {
		try {
			var hash = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("Every Java has SHA-256", e);
		}
	}

	/** @param linkTicket the ticket of a connect; null for a sign-in */
	record Handoff(String challenge, ExternalProfile profile, String linkTicket, Instant expiresAt) {
	}

}
