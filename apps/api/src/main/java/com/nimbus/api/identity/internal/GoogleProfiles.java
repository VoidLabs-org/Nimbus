package com.nimbus.api.identity.internal;

import java.util.Locale;
import java.util.Map;

/** Reads Google's ID-token claims (OpenID Connect) into an {@link ExternalProfile}. */
final class GoogleProfiles {

	static final String PROVIDER = "google";

	private GoogleProfiles() {
	}

	static ExternalProfile from(Map<String, Object> claims) {
		var email = text(claims.get("email"));
		return new ExternalProfile(PROVIDER, text(claims.get("sub")),
				email == null ? null : email.toLowerCase(Locale.ROOT), isTrue(claims.get("email_verified")),
				text(claims.get("name")), text(claims.get("picture")));
	}

	private static String text(Object claim) {
		return claim instanceof String value && !value.isBlank() ? value.strip() : null;
	}

	// Google has sent this claim as the string "true" as well as a boolean.
	private static boolean isTrue(Object claim) {
		return Boolean.TRUE.equals(claim) || claim instanceof String value && value.equalsIgnoreCase("true");
	}

}
