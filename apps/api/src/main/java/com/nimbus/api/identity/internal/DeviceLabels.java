package com.nimbus.api.identity.internal;

import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import ua_parser.Parser;

/**
 * Names a browser for the list of a User's sessions: "Chrome on Windows". Built from the {@code User-Agent} header
 * when the list is read, not when the session starts, so a newer list of browsers also names old sessions. The raw
 * header never leaves the API. The Desktop app adds a {@code Nimbus/<version>} product token to its header and is
 * named after the system it runs on: "Nimbus for Mac".
 */
@Component
class DeviceLabels {

	static final String UNKNOWN = "Unknown browser";

	static final String IN_APP = "In-app browser";

	static final String DESKTOP_APP = "Nimbus";

	/** The Desktop app's product token: a word of its own, not part of another ("MyNimbus/3") or of a comment. */
	private static final Pattern DESKTOP_TOKEN = Pattern.compile("(^|\\s)Nimbus/[^\\s()]+($|\\s)");

	private final Parser parser;

	DeviceLabels() {
		this.parser = new Parser();
	}

	/**
	 * "Chrome on Windows". When only the browser is known, just its name ("Firefox"); when only the system is,
	 * "Unknown browser on Linux"; {@value #UNKNOWN} when neither is.
	 */
	String of(String userAgent) {
		if (userAgent == null || userAgent.isBlank()) {
			return UNKNOWN;
		}
		var client = parser.parse(userAgent);
		if (DESKTOP_TOKEN.matcher(userAgent).find()) {
			var desktop = desktopSystem(known(client.os == null ? null : client.os.family), userAgent);
			return desktop == null ? DESKTOP_APP : DESKTOP_APP + " for " + desktop;
		}
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
		// A page inside another app's web view has no browser of its own to name.
		if (family.contains("WebView")) {
			return IN_APP;
		}
		var name = family.replace(" Mobile iOS", "").replace(" Mobile", "").replace("Mobile ", "").strip();
		return name.isEmpty() ? family : name;
	}

	/**
	 * The Desktop app runs on Mac, Windows or Linux. The parser names some Linux distributions ("Ubuntu"), so any other
	 * system whose header says Linux is Linux too, except Android, whose headers say Linux as well: a phone is none
	 * of the three.
	 */
	private static String desktopSystem(String family, String userAgent) {
		if ("Mac OS X".equals(family)) {
			return "Mac";
		}
		if (family != null && family.startsWith("Windows")) {
			return "Windows";
		}
		return userAgent.contains("Linux") && !"Android".equals(family) ? "Linux" : null;
	}

	private static String systemName(String family) {
		return "Mac OS X".equals(family) ? "macOS" : family;
	}

	/** The parser says "Other" for what it can't place. */
	private static String known(String family) {
		return family == null || family.isBlank() || family.equals("Other") ? null : family;
	}

}
