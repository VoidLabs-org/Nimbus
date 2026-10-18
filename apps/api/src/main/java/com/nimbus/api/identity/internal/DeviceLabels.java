package com.nimbus.api.identity.internal;

import org.springframework.stereotype.Component;
import ua_parser.Parser;

/**
 * Names a browser for the list of a User's sessions: "Chrome on Windows". Built from the {@code User-Agent} header
 * when the list is read, not when the session starts, so a newer list of browsers also names old sessions. The raw
 * header never leaves the API.
 */
@Component
class DeviceLabels {

	static final String UNKNOWN = "Unknown browser";

	private final Parser parser;

	DeviceLabels() {
		this.parser = new Parser();
	}

	/** "Chrome on Windows"; just one half when only that is known; {@value #UNKNOWN} when neither is. */
	String of(String userAgent) {
		if (userAgent == null || userAgent.isBlank()) {
			return UNKNOWN;
		}
		var client = parser.parse(userAgent);
		var browser = browserName(known(client.userAgent == null ? null : client.userAgent.family));
		var system = systemName(known(client.os == null ? null : client.os.family));
		if (browser == null && system == null) {
			return UNKNOWN;
		}
		if (system == null) {
			return browser;
		}
		return (browser == null ? UNKNOWN : browser) + " on " + system;
	}

	/** The parser keeps the phone variants apart ("Mobile Safari", "Chrome Mobile iOS"); a person sees one browser. */
	private static String browserName(String family) {
		if (family == null) {
			return null;
		}
		var name = family.replace(" Mobile iOS", "").replace(" Mobile", "").replace("Mobile ", "").strip();
		return name.isEmpty() ? family : name;
	}

	private static String systemName(String family) {
		return "Mac OS X".equals(family) ? "macOS" : family;
	}

	/** The parser says "Other" for what it can't place. */
	private static String known(String family) {
		return family == null || family.isBlank() || family.equals("Other") ? null : family;
	}

}
