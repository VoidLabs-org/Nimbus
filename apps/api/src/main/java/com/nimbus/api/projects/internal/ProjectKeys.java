package com.nimbus.api.projects.internal;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** The shape of a Project key, and how one typed in any case is turned into the stored, capitalised form. */
final class ProjectKeys {

	/** 2 to 10 ASCII letters or digits, starting with a letter. */
	static final String PATTERN = "[A-Za-z][A-Za-z0-9]{1,9}";

	private static final Pattern VALID = Pattern.compile(PATTERN);

	private ProjectKeys() {
	}

	/**
	 * The stored key for what was typed, or empty when it is not a key at all. Checked before capitalising, because
	 * Unicode case mapping would turn letters like "ſ" and "ı" into S and I and open a project they don't name.
	 */
	static Optional<String> normalize(String key) {
		return key != null && VALID.matcher(key).matches() ? Optional.of(key.toUpperCase(Locale.ROOT))
				: Optional.empty();
	}

}
