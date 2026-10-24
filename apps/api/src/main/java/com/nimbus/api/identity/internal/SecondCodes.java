package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.nimbus.api.identity.RecoveryCodeUsed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * The second code a User with Two-step verification gives beside something else they know: after a right Reset code
 * (forgot password) or their password (Confirm it's you). Sign-in has its own pending sign-in and doesn't use this.
 */
@Component
class SecondCodes {

	private final TwoStepStore twoStep;

	private final SignInCodeCheck codes;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	SecondCodes(TwoStepStore twoStep, SignInCodeCheck codes, Clock clock, ApplicationEventPublisher events) {
		this.twoStep = twoStep;
		this.codes = codes;
		this.clock = clock;
		this.events = events;
	}

	/**
	 * Checks the second code; nothing for a User without Two-step verification. A right Sign-in code can't be used
	 * again, and a right Recovery code is used up and publishes {@link RecoveryCodeUsed}, in the caller's transaction.
	 *
	 * @return why the caller can't go ahead; null when it can
	 * @throws SlidingWindowLimiter.LimitExceededException when the User got too many codes wrong in the last hour
	 */
	RuntimeException check(UUID userId, String twoStepCode, String recoveryCode) {
		var authenticator = twoStep.find(userId).orElse(null);
		if (authenticator == null) {
			return null;
		}
		if (!SignInCodeCheck.isRecoveryCode(recoveryCode) && (twoStepCode == null || twoStepCode.isBlank())) {
			return new TwoStepRequiredException();
		}
		// Postgres keeps microseconds, so the time is cut to them before it is stored and announced.
		var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		var answer = codes.useEither(userId, authenticator, twoStepCode, recoveryCode, now);
		if (!answer.right()) {
			return new WrongTwoStepCodeException(answer.recoveryCode());
		}
		if (answer.usedRecoveryCode()) {
			events.publishEvent(new RecoveryCodeUsed(userId, now, answer.recoveryCodesLeft()));
		}
		return null;
	}

	/** Becomes a 400 with {@code code: two_step_required}: the first answer was right, and a second code must follow. */
	static class TwoStepRequiredException extends RuntimeException {

		TwoStepRequiredException() {
			super("Enter the code from your authenticator app, or a recovery code.");
		}

	}

	/** Becomes a 400 with {@code code: invalid_two_step_code}. */
	static class WrongTwoStepCodeException extends RuntimeException {

		/** @param recoveryCode whether the wrong code was a Recovery code, which the message names */
		WrongTwoStepCodeException(boolean recoveryCode) {
			super(recoveryCode ? "That recovery code isn't right, or it was used already."
					: "That code didn't work. Check your authenticator app and try again.");
		}

	}

}
