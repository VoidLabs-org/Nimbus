package com.nimbus.api.identity.internal;

import java.time.Clock;

import javax.crypto.SecretKey;

import org.springframework.stereotype.Component;

/** The one {@link EmailedCodes} of each kind, so every service that issues or checks codes shares the same setup. */
@Component
class EmailedCodeKinds {

	private final EmailedCodes verification;

	private final EmailedCodes reset;

	EmailedCodeKinds(SecretKey jwtKey, EmailedCodeRepository codes, Clock clock) {
		this.verification = new EmailedCodes(EmailedCodes.Kind.VERIFICATION, jwtKey, codes, clock);
		this.reset = new EmailedCodes(EmailedCodes.Kind.RESET, jwtKey, codes, clock);
	}

	EmailedCodes verification() {
		return verification;
	}

	EmailedCodes reset() {
		return reset;
	}

}
