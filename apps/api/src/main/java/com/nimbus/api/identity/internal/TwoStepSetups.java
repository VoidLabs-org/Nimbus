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
 * Recovery codes once a Sign-in code proved the User's app has the key. A setup belongs to the Session that started
 * it (a stolen token for another Session of the User can't prove it or turn it on), allows {@link #MAX_WRONG_CODES}
 * wrong codes, and is thrown away when the window is closed. Nothing is stored until the User turns it on. Kept in
 * memory only, like {@link LinkTickets}: a restart just makes the User start setup again.
 */
@Component
class TwoStepSetups {

	static final Duration LIFETIME = Duration.ofMinutes(10);

	static final int MAX_WRONG_CODES = 5;

	private final ConcurrentHashMap<UUID, Setup> setups = new ConcurrentHashMap<>();

	private final Clock clock;

	TwoStepSetups(Clock clock) {
		this.clock = clock;
	}

	/** Starts a setup with {@code key} for the Session, replacing any the User had in progress. */
	void start(UUID userId, UUID sessionId, byte[] key) {
		var now = clock.instant();
		setups.values().removeIf(setup -> !setup.expiresAt().isAfter(now));
		setups.put(userId, new Setup(sessionId, key, 0, null, null, now.plus(LIFETIME)));
	}

	/** The User's setup in progress, if this Session started it; empty once it expired. */
	Optional<Setup> find(UUID userId, UUID sessionId) {
		return Optional.ofNullable(setups.get(userId))
			.filter(setup -> setup.sessionId().equals(sessionId))
			.filter(setup -> setup.expiresAt().isAfter(clock.instant()));
	}

	/**
	 * Marks the setup proved, by a code for {@code step}, and keeps the Recovery codes the User is shown.
	 *
	 * @return the setup as it now is: the given codes, or the ones of a call that got there first, so every caller
	 * shows the codes that will be stored
	 */
	Setup verified(UUID userId, Setup setup, long step, List<String> recoveryCodes) {
		return setups.computeIfPresent(userId, (id, current) -> current.isVerified() || current != setup ? current
				: new Setup(current.sessionId(), current.key(), current.wrongCodes(), step, List.copyOf(recoveryCodes),
						current.expiresAt()));
	}

	/** Counts a wrong code; the last one allowed throws the setup away. @return true when it was thrown away */
	boolean wrongCode(UUID userId, Setup setup) {
		var after = setups.computeIfPresent(userId, (id, current) -> {
			if (current != setup) {
				return current;
			}
			var wrong = current.wrongCodes() + 1;
			return wrong >= MAX_WRONG_CODES ? null
					: new Setup(current.sessionId(), current.key(), wrong, current.verifiedStep(),
							current.recoveryCodes(), current.expiresAt());
		});
		return after == null;
	}

	/** Takes the setup away, to be stored, if this Session proved it; empty otherwise. */
	Optional<Setup> takeVerified(UUID userId, UUID sessionId) {
		var setup = find(userId, sessionId).filter(Setup::isVerified);
		setup.ifPresent(found -> setups.remove(userId, found));
		return setup;
	}

	/** Throws away the setup this Session started, if any: the User closed the window. */
	void discard(UUID userId, UUID sessionId) {
		find(userId, sessionId).ifPresent(found -> setups.remove(userId, found));
	}

	/**
	 * @param sessionId the Session that started it
	 * @param wrongCodes wrong codes so far
	 * @param verifiedStep the step of the Sign-in code that proved the key, null until then
	 * @param recoveryCodes the codes shown to the User, null until then
	 */
	record Setup(UUID sessionId, byte[] key, int wrongCodes, Long verifiedStep, List<String> recoveryCodes,
			Instant expiresAt) {

		boolean isVerified() {
			return verifiedStep != null;
		}

	}

}
