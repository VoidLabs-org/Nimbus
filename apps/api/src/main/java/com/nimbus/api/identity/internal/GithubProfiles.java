package com.nimbus.api.identity.internal;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads GitHub's API responses into an {@link ExternalProfile}. GitHub is plain OAuth 2, not OpenID Connect, so
 * there is no ID token: the profile comes from {@code GET /user}, and the email only from {@code GET /user/emails}
 * ({@link GithubUserService} puts that list under {@link #EMAILS_ATTRIBUTE}), because {@code /user} shows an email
 * only when the person made one public, and never says whether it is verified.
 */
final class GithubProfiles {

	static final String PROVIDER = "github";

	/** Where {@link GithubUserService} stores the {@code GET /user/emails} list among the user's attributes. */
	static final String EMAILS_ATTRIBUTE = "emails";

	private GithubProfiles() {
	}

	static ExternalProfile from(Map<String, Object> attributes) {
		var primary = primaryEmail(attributes.get(EMAILS_ATTRIBUTE));
		var email = primary == null ? null : text(primary.get("email"));
		var verified = email != null && Boolean.TRUE.equals(primary.get("verified"));
		var login = text(attributes.get("login"));
		var name = text(attributes.get("name"));
		return new ExternalProfile(PROVIDER, String.valueOf(attributes.get("id")),
				email == null ? null : email.toLowerCase(Locale.ROOT), verified, name != null ? name : login,
				text(attributes.get("avatar_url")), login);
	}

	// Only the primary address counts: it is the one the person treats as theirs. Another verified address says
	// nothing about the primary one, so an unverified primary makes the whole login unverified.
	private static Map<?, ?> primaryEmail(Object emails) {
		if (emails instanceof List<?> list) {
			for (var entry : list) {
				if (entry instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get("primary"))) {
					return map;
				}
			}
		}
		return null;
	}

	private static String text(Object value) {
		return value instanceof String string && !string.isBlank() ? string.strip() : null;
	}

}
