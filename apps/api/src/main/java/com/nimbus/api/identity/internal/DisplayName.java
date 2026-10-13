package com.nimbus.api.identity.internal;

import java.util.Optional;
import java.util.stream.IntStream;

/**
 * What a display name may be, in one place: registration, renaming and names that arrive from a provider all go
 * through here. A name shows in menus, boards and assignee lists, so it must be visible and must not change how
 * the text around it is drawn.
 *
 * <p>A valid name, after surrounding whitespace is removed, has at least one visible character, at most
 * {@value #MAX_LENGTH} characters (as people count them: code points, so an emoji is one), and none of:
 * control characters (ASCII and C1), line and paragraph separators, or format characters (zero-width space, word
 * joiner, byte order mark, soft hyphen, and every bidirectional mark, embedding, override and isolate). The one
 * exception is the zero-width joiner and non-joiner (U+200D, U+200C) between two visible characters, because
 * emoji sequences and Persian or Indic scripts need them.
 */
final class DisplayName {

	static final int MAX_LENGTH = 100;

	private static final int ZERO_WIDTH_NON_JOINER = 0x200C;

	private static final int ZERO_WIDTH_JOINER = 0x200D;

	private DisplayName() {
	}

	/** Drops surrounding whitespace. Null stays null, so validation can report it. */
	static String normalize(String name) {
		return name == null ? null : name.strip();
	}

	/** @return why {@code name} (already normalized) is not a valid display name, or empty when it is */
	static Optional<String> problem(String name) {
		if (name == null || !hasVisibleCharacter(name)) {
			return Optional.of("must not be blank");
		}
		if (name.codePointCount(0, name.length()) > MAX_LENGTH) {
			return Optional.of("must be at most " + MAX_LENGTH + " characters");
		}
		var codePoints = name.codePoints().toArray();
		for (var i = 0; i < codePoints.length; i++) {
			var codePoint = codePoints[i];
			if (isJoiner(codePoint) ? !joinsVisibleCharacters(codePoints, i) : isInvisibleOrDirectional(codePoint)) {
				return Optional.of("must not contain control, invisible or text-direction characters");
			}
		}
		return Optional.empty();
	}

	/**
	 * Makes a name from a provider valid, because that sign-in can't be refused over a name: drops what
	 * {@link #problem} would reject, then cuts to {@value #MAX_LENGTH} characters. Returns an empty string when
	 * nothing usable is left.
	 */
	static String clean(String name) {
		if (name == null) {
			return "";
		}
		var kept = name.codePoints().filter(c -> isJoiner(c) || !isInvisibleOrDirectional(c)).toArray();
		var text = withoutStrayJoiners(kept).strip();
		if (text.codePointCount(0, text.length()) > MAX_LENGTH) {
			// Cutting may leave a joiner at the end, so the joiners are checked again.
			text = withoutStrayJoiners(text.substring(0, text.offsetByCodePoints(0, MAX_LENGTH)).codePoints().toArray())
				.strip();
		}
		return hasVisibleCharacter(text) ? text : "";
	}

	private static String withoutStrayJoiners(int[] codePoints) {
		return IntStream.range(0, codePoints.length)
			.filter(i -> !isJoiner(codePoints[i]) || joinsVisibleCharacters(codePoints, i))
			.map(i -> codePoints[i])
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
			.toString();
	}

	private static boolean isJoiner(int codePoint) {
		return codePoint == ZERO_WIDTH_JOINER || codePoint == ZERO_WIDTH_NON_JOINER;
	}

	private static boolean joinsVisibleCharacters(int[] codePoints, int joiner) {
		return joiner > 0 && joiner < codePoints.length - 1 && isVisible(codePoints[joiner - 1])
				&& isVisible(codePoints[joiner + 1]);
	}

	private static boolean isInvisibleOrDirectional(int codePoint) {
		return switch (Character.getType(codePoint)) {
			case Character.CONTROL, Character.FORMAT, Character.LINE_SEPARATOR, Character.PARAGRAPH_SEPARATOR -> true;
			default -> false;
		};
	}

	/** Takes up room and shows something: not a space, control or format character, and not a mark on its own. */
	private static boolean isVisible(int codePoint) {
		if (Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)) {
			return false;
		}
		return !isInvisibleOrDirectional(codePoint);
	}

	private static boolean hasVisibleCharacter(String name) {
		return name.codePoints().anyMatch(c -> isVisible(c) && !isMark(c));
	}

	private static boolean isMark(int codePoint) {
		return switch (Character.getType(codePoint)) {
			case Character.NON_SPACING_MARK, Character.COMBINING_SPACING_MARK, Character.ENCLOSING_MARK -> true;
			default -> false;
		};
	}

}
