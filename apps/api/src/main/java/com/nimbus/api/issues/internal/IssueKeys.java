package com.nimbus.api.issues.internal;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** An Issue key is the Project key, a dash and the Issue's number, like {@code NIM-12}; it matches in any case. */
record IssueKeys(String projectKey, int number) {

	// Only ASCII letters and digits, and no more digits than an int holds, so odd input is "not found", not an error.
	private static final Pattern FORMAT = Pattern.compile("([A-Za-z][A-Za-z0-9]{1,9})-([1-9][0-9]{0,8})");

	static Optional<IssueKeys> parse(String key) {
		var matcher = FORMAT.matcher(key);
		if (!matcher.matches()) return Optional.empty();
		return Optional.of(new IssueKeys(matcher.group(1).toUpperCase(Locale.ROOT), Integer.parseInt(matcher.group(2))));
	}

	static String format(String projectKey, int number) {
		return projectKey + "-" + number;
	}
}
