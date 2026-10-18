package com.nimbus.api.identity.internal;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * The tickets that let a full page load start connecting a provider. That load carries no Bearer token, so the web
 * app first asks for a ticket (with its token) and passes it on the load. A ticket is random and opaque, lasts
 * {@link #LIFETIME}, works once and is bound to the Session that asked for it. Tickets live in memory only: a
 * restart just makes the User press Connect again.
 */
@Component
class LinkTickets {

	static final Duration LIFETIME = Duration.ofMinutes(2);

	private static final int BYTES = 32;

	private final ConcurrentHashMap<String, Ticket> issued = new ConcurrentHashMap<>();

	private final SecureRandom random = new SecureRandom();

	private final Clock clock;

	LinkTickets(Clock clock) {
		this.clock = clock;
	}

	/** A new ticket for the User, good for the Session that asks. */
	String issue(UUID userId, UUID sessionId) {
		var now = clock.instant();
		issued.values().removeIf(ticket -> !ticket.expiresAt().isAfter(now));
		var bytes = new byte[BYTES];
		random.nextBytes(bytes);
		var value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		issued.put(value, new Ticket(userId, sessionId, now.plus(LIFETIME)));
		return value;
	}

	/** Takes the ticket back, so it can't be used again; empty when it is unknown, used or expired. */
	Optional<Ticket> redeem(String value) {
		if (value == null) {
			return Optional.empty();
		}
		var ticket = issued.remove(value);
		return Optional.ofNullable(ticket).filter(found -> found.expiresAt().isAfter(clock.instant()));
	}

	record Ticket(UUID userId, UUID sessionId, Instant expiresAt) {
	}

}
