package com.nimbus.api.identity.internal;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Profile picture settings.
 *
 * @param baseUrl where uploaded photos are served, without a trailing slash; a photo's address is this plus its key.
 * Defaults to the API's own {@code /api/profile-pictures}. A public bucket on our own domain can replace it later.
 */
@ConfigurationProperties("nimbus.profile-pictures")
record ProfilePictureProperties(@DefaultValue("/api/profile-pictures") String baseUrl) {

	/** A blank value (PROFILE_PICTURES_URL= in .env) means the default, not an empty address. */
	ProfilePictureProperties {
		baseUrl = baseUrl.isBlank() ? DEFAULT : withoutTrailingSlashes(baseUrl.strip());
	}

	private static String withoutTrailingSlashes(String url) {
		var end = url.length();
		while (end > 0 && url.charAt(end - 1) == '/') {
			end--;
		}
		return url.substring(0, end);
	}

	static final String DEFAULT = "/api/profile-pictures";

}
