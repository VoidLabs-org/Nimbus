package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.stereotype.Component;

/**
 * Checks a Sign-in code from the User's app, the one way every check does it (signing in, View new codes): the key is
 * decrypted, the check counts toward the hourly lock, a code for one step either side of now is accepted but never
 * one for the step last used or an older one, and a right code is marked used and takes its check back. Run it in a
 * transaction holding the User's row lock, so one code can't be accepted twice.
 */
@Component
class SignInCodeCheck {

	private final TwoStepStore store;

	private final TwoStepSecrets secrets;

	private final SignInCodeLock lock;

	SignInCodeCheck(TwoStepStore store, TwoStepSecrets secrets, SignInCodeLock lock) {
		this.store = store;
		this.secrets = secrets;
		this.lock = lock;
	}

	/**
	 * @return whether the code is right; a right one is used up from now on
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	boolean use(UUID userId, TwoStepStore.Authenticator authenticator, String code, Instant at) {
		var key = secrets.decrypt(userId, authenticator.encryptedKey());
		// Counted only now, so failures that are not about the code never use up the User's hour.
		var check = lock.check(userId);
		var step = SignInCodeMath.matchingStep(key, code, at, authenticator.lastUsedStep());
		if (step.isEmpty()) {
			return false;
		}
		lock.right(userId, check);
		store.useStep(userId, step.getAsLong());
		return true;
	}

}
