package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.util.Locale;

import org.springframework.stereotype.Component;

/**
 * How often Nimbus may email one address: at least {@code emailSendInterval} between sends and at most
 * {@code emailSendsPerHour} an hour, counted per address however many Users or flows asked. Verification codes
 * spend it today; forgot-password and email change are meant to spend the same budget, so one address can't be
 * flooded by combining them.
 */
@Component
class EmailSendBudget {

	private static final Duration HOUR = Duration.ofHours(1);

	private static final String MESSAGE = "Too many emails sent to this address. Try again later.";

	private final SlidingWindowLimiter spacing;

	private final SlidingWindowLimiter hourly;

	EmailSendBudget(AuthProperties properties, Clock clock) {
		this.spacing = new SlidingWindowLimiter(1, properties.emailSendInterval(), clock);
		this.hourly = new SlidingWindowLimiter(properties.emailSendsPerHour(), HOUR, clock);
	}

	/**
	 * Spends one send to {@code email}.
	 *
	 * @throws SlidingWindowLimiter.LimitExceededException when a send isn't allowed yet; nothing is spent, and
	 * the exception carries the wait for whichever limit refused first (spacing, then the hour)
	 */
	void spend(String email) {
		var key = email.toLowerCase(Locale.ROOT);
		// Spacing first and alone: a send refused on spacing must not take an hourly slot, even briefly, or a
		// parallel request that would fit could be refused because of it.
		var spacingSend = spacing.acquire(key, MESSAGE);
		try {
			hourly.acquire(key, MESSAGE);
		}
		catch (SlidingWindowLimiter.LimitExceededException e) {
			spacing.release(key, spacingSend);
			throw e;
		}
	}

}
