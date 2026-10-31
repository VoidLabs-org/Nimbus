package com.nimbus.api.identity.internal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * The tickets that let a full page load start connecting a provider. That load carries no Bearer token, so the web
 * app first asks for a ticket (with its token) and passes it on the load. A ticket is random and opaque, lasts
 * {@link #LIFETIME}, works once, and is bound to the Session that asked for it, to the provider it was issued for,
 * and to the browser that asked: the answer also sets a cookie ({@link #COOKIE}) holding a second random value,
 * which must come back on the callback. Without that last binding anyone could send a victim a link with their own
 * ticket and have the victim's Google account connected to the attacker's Nimbus account. Tickets live in memory
 * only: a restart just makes the User press Connect again.
 */
@Component
class LinkTickets {

	static final Duration LIFETIME = Duration.ofMinutes(2);

	static final String COOKIE = "link_binder";

	private static final int BYTES = 32;

	private final ConcurrentHashMap<String, Ticket> issued = new ConcurrentHashMap<>();

	private final SecureRandom random = new SecureRandom();

	private final Clock clock;

	LinkTickets(Clock clock) {
		this.clock = clock;
	}

	/** A new ticket for the User, good for the Session that asks, the provider and the browser holding the binder. */
	Issued issue(UUID userId, UUID sessionId, String provider) {
		var now = clock.instant();
		issued.values().removeIf(ticket -> !ticket.expiresAt().isAfter(now));
		var value = randomValue();
		var binder = randomValue();
		issued.put(value, new Ticket(userId, sessionId, provider, binder, now.plus(LIFETIME)));
		return new Issued(value, binder);
	}

	/**
	 * Takes the ticket back, so it can't be used again, whether or not it fits; empty when it is unknown, used,
	 * expired, for another provider, or when {@code binder} (from the cookie) is not the one it was issued with.
	 */
	Optional<Ticket> redeem(String value, String provider, String binder) {
		if (value == null) {
			return Optional.empty();
		}
		return Optional.ofNullable(issued.remove(value))
			.filter(found -> found.expiresAt().isAfter(clock.instant()))
			.filter(found -> found.provider().equals(provider))
			.filter(found -> binder != null && MessageDigest.isEqual(found.binder().getBytes(StandardCharsets.UTF_8),
					binder.getBytes(StandardCharsets.UTF_8)));
	}

	/**
	 * Takes the ticket back for a connect the Desktop app finishes (ADR 0008), where the browser that went to the
	 * provider holds no binder cookie: the Session trading in the app's code must be the one that asked instead. Empty
	 * as for {@link #redeem}, and when the ticket is another User's or another Session's.
	 */
	Optional<Ticket> redeemFor(String value, String provider, UUID userId, UUID sessionId) {
		if (value == null) {
			return Optional.empty();
		}
		return Optional.ofNullable(issued.remove(value))
			.filter(found -> found.expiresAt().isAfter(clock.instant()))
			.filter(found -> found.provider().equals(provider))
			.filter(found -> found.userId().equals(userId) && found.sessionId().equals(sessionId));
	}

	/** Throws the ticket away, e.g. when the connect ended at the provider. */
	void discard(String value) {
		if (value != null) {
			issued.remove(value);
		}
	}

	/** The cookie that binds the ticket to the browser that asked: only for the OAuth handshake, and as short-lived. */
	static ResponseCookie cookie(String binder) {
		return ResponseCookie.from(COOKIE, binder)
			.httpOnly(true)
			.secure(true)
			// Lax, not Strict: the callback is a top-level navigation coming from the provider.
			.sameSite("Lax")
			.path(ReturnPathAuthorizationRequestResolver.BASE_URI)
			.maxAge(LIFETIME)
			.build();
	}

	private String randomValue() {
		var bytes = new byte[BYTES];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	/** @param binder goes in the cookie, never in a URL */
	record Issued(String ticket, String binder) {
	}

	record Ticket(UUID userId, UUID sessionId, String provider, String binder, Instant expiresAt) {
	}

}
