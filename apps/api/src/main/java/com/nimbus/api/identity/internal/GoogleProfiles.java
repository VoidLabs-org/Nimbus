package com.nimbus.api.identity.internal;

import java.util.Locale;
import java.util.Map;

/** Reads Google's ID-token claims (OpenID Connect) into an {@link ExternalProfile}. */
final class GoogleProfiles {

	static final String PROVIDER = "google";

	private GoogleProfiles() {
	}

	static ExternalProfile from(Map<String, Object> claims) {
		var claimedEmail = text(claims.get("email"));
		var email = claimedEmail == null ? null : claimedEmail.toLowerCase(Locale.ROOT);
		var verified = isTrue(claims.get("email_verified"));
		// The card shows an address as "Connected as ...": never one Google has not vouched for.
		return new ExternalProfile(PROVIDER, text(claims.get("sub")), email, verified, text(claims.get("name")),
				text(claims.get("picture")), verified ? email : null);
	}

	private static String text(Object claim) {
		return claim instanceof String value && !value.isBlank() ? value.strip() : null;
	}

	// Google has sent this claim as the string "true" as well as a boolean.
	private static boolean isTrue(Object claim) {
		return Boolean.TRUE.equals(claim) || claim instanceof String value && value.equalsIgnoreCase("true");
	}

}
