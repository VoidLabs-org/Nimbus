package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Setups of Two-step verification in progress, one per User: the new key from the moment the window opens, and the
 * Recovery codes once a Sign-in code proved the User's app has the key. Nothing is stored until the User turns it
 * on, so closing the window throws everything away. Kept in memory only, like {@link LinkTickets}: a restart just
 * makes the User start setup again.
 */
@Component
class TwoStepSetups {

	static final Duration LIFETIME = Duration.ofMinutes(10);

	private final ConcurrentHashMap<UUID, Setup> setups = new ConcurrentHashMap<>();

	private final Clock clock;

	TwoStepSetups(Clock clock) {
		this.clock = clock;
	}

	/** Starts a setup with {@code key}, replacing any the User had in progress. */
	void start(UUID userId, byte[] key) {
		var now = clock.instant();
		setups.values().removeIf(setup -> !setup.expiresAt().isAfter(now));
		setups.put(userId, new Setup(key, null, null, now.plus(LIFETIME)));
	}

	/** The User's setup in progress; empty once it expired. */
	Optional<Setup> find(UUID userId) {
		return Optional.ofNullable(setups.get(userId)).filter(setup -> setup.expiresAt().isAfter(clock.instant()));
	}

	/** Marks the setup proved, by a code for {@code step}, and keeps the Recovery codes the User is shown. */
	void verified(UUID userId, Setup setup, long step, List<String> recoveryCodes) {
		setups.replace(userId, setup, new Setup(setup.key(), step, List.copyOf(recoveryCodes), setup.expiresAt()));
	}

	/** Takes the User's proved setup away, to be stored; empty when there is none, or it isn't proved yet. */
	Optional<Setup> takeVerified(UUID userId) {
		var setup = find(userId).filter(Setup::isVerified);
		setup.ifPresent(found -> setups.remove(userId, found));
		return setup;
	}

	/**
	 * @param verifiedStep the step of the Sign-in code that proved the key, null until then
	 * @param recoveryCodes the codes shown to the User, null until then
	 */
	record Setup(byte[] key, Long verifiedStep, List<String> recoveryCodes, Instant expiresAt) {

		boolean isVerified() {
			return verifiedStep != null;
		}

	}

}
