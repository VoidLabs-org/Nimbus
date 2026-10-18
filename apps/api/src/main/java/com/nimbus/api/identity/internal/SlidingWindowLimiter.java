package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Counts attempts per key (an email, an IP address) over a sliding window. Kept in memory, which is enough while
 * the API runs as a single instance.
 */
class SlidingWindowLimiter {

	/** Expired keys are swept out at most this often, so random keys can't grow the map forever. */
	private static final Duration SWEEP_INTERVAL = Duration.ofMinutes(1);

	private final int limit;

	private final Duration window;

	private final Clock clock;

	private final ConcurrentHashMap<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

	private final AtomicReference<Instant> nextSweep;

	SlidingWindowLimiter(int limit, Duration window, Clock clock) {
		if (limit < 1) {
			throw new IllegalArgumentException("limit must be at least 1");
		}
		this.limit = limit;
		this.window = window;
		this.clock = clock;
		this.nextSweep = new AtomicReference<>(clock.instant().plus(SWEEP_INTERVAL));
	}

	/**
	 * Counts one attempt for {@code key}, in a single atomic step, so parallel requests can't all slip past the
	 * limit.
	 *
	 * @return the attempt that was counted, which {@link #release} can take back
	 * @throws LimitExceededException when {@code key} already used up its attempts; nothing is counted then
	 */
	Instant acquire(String key, String message) {
		var now = clock.instant();
		var wait = new Duration[1];
		attempts.compute(key, (k, times) -> {
			var updated = times == null ? new ArrayDeque<Instant>() : times;
			dropExpired(updated, now);
			if (updated.size() >= limit) {
				wait[0] = Duration.between(now, updated.peekFirst().plus(window));
			}
			else {
				updated.addLast(now);
			}
			return updated;
		});
		sweepIfDue(now);
		if (wait[0] != null) {
			throw new LimitExceededException(message, wait[0]);
		}
		return now;
	}

	/**
	 * Takes back one attempt returned by {@link #acquire}, e.g. when it turned out to be a success. Other attempts
	 * for the key, including other requests' failures, stay counted.
	 */
	void release(String key, Instant attempt) {
		attempts.computeIfPresent(key, (k, times) -> {
			times.removeLastOccurrence(attempt);
			return times.isEmpty() ? null : times;
		});
	}

	/** Forgets every attempt counted for {@code key}, e.g. once its owner proved who they are another way. */
	void clear(String key) {
		attempts.remove(key);
	}

	private void sweepIfDue(Instant now) {
		var due = nextSweep.get();
		// Only the thread that wins the compare-and-set sweeps; the others carry on.
		if (now.isBefore(due) || !nextSweep.compareAndSet(due, now.plus(SWEEP_INTERVAL))) {
			return;
		}
		attempts.keySet().forEach(key -> attempts.computeIfPresent(key, (k, times) -> {
			dropExpired(times, now);
			return times.isEmpty() ? null : times;
		}));
	}

	private void dropExpired(Deque<Instant> times, Instant now) {
		while (!times.isEmpty() && !times.peekFirst().plus(window).isAfter(now)) {
			times.removeFirst();
		}
	}

	/** Thrown when a key is over its limit; becomes a 429 with Retry-After. */
	static class LimitExceededException extends RuntimeException {

		private final Duration retryAfter;

		LimitExceededException(String message, Duration retryAfter) {
			super(message);
			this.retryAfter = retryAfter;
		}

		Duration retryAfter() {
			return retryAfter;
		}

	}

}
