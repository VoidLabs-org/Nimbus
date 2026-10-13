package com.nimbus.api.identity.internal;

import java.text.BreakIterator;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * What a display name may be, in one place: registration, renaming and names that arrive from a provider all go
 * through here. A name shows in menus, boards and assignee lists, so it must be visible and must not change how
 * the text around it is drawn.
 *
 * <p>A valid name, after surrounding whitespace is removed (no-break and other Unicode spaces included), has at
 * least one visible character and at most {@value #MAX_LENGTH} characters, counted as code points so an emoji is
 * one. It contains none of:
 * <ul>
 * <li>control characters (ASCII and C1), line and paragraph separators, lone surrogates, private-use characters;
 * <li>format characters: zero-width space, word joiner, byte order mark, soft hyphen, and every bidirectional
 * mark, embedding, override and isolate;
 * <li>the combining grapheme joiner, which draws nothing;
 * <li>tag characters, except in a flag sequence (a black flag, 2 to 7 tag letters or digits, the cancel tag):
 * elsewhere they carry text nobody can see;
 * <li>variation selectors, except U+FE0E and U+FE0F after a character that is not a letter (emoji and keycaps),
 * and the ideographic ones after a Han character; never two in a row;
 * <li>a combining mark with nothing visible before it, or more than {@value #MAX_STACKED_MARKS} marks stacked on
 * one character;
 * <li>U+200D and U+200C (zero-width joiner and non-joiner), unless between two visible characters, which emoji
 * sequences and Persian or Indic scripts need.
 * </ul>
 *
 * <p>Code points Java does not know yet (unassigned in its Unicode tables) are allowed, because refusing them
 * would refuse the newest emoji. So a format character added in a later Unicode version gets through until the
 * JDK is updated.
 *
 * <p>The rule is one function, {@link #repair}, which removes what is not allowed. A name is valid when repairing
 * it changes nothing; a provider's name is made valid by repairing it.
 */
final class DisplayName {

	static final int MAX_LENGTH = 100;

	static final int MAX_STACKED_MARKS = 5;

	/** Provider names are cut to this before any other work, so a huge one costs nothing. */
	private static final int INPUT_LIMIT = 4 * MAX_LENGTH;

	private static final int ZERO_WIDTH_NON_JOINER = 0x200C;

	private static final int ZERO_WIDTH_JOINER = 0x200D;

	private static final int COMBINING_GRAPHEME_JOINER = 0x034F;

	private static final int WAVING_BLACK_FLAG = 0x1F3F4;

	private static final int CANCEL_TAG = 0xE007F;

	private DisplayName() {
	}

	/** Drops surrounding whitespace, including no-break and other Unicode spaces. Null stays null. */
	static String normalize(String name) {
		if (name == null) {
			return null;
		}
		var start = 0;
		var end = name.length();
		while (start < end && isSpace(name.codePointAt(start))) {
			start += Character.charCount(name.codePointAt(start));
		}
		while (end > start && isSpace(name.codePointBefore(end))) {
			end -= Character.charCount(name.codePointBefore(end));
		}
		return name.substring(start, end);
	}

	/** @return why {@code name} (already normalized) is not a valid display name, or empty when it is */
	static Optional<String> problem(String name) {
		if (name == null) {
			return Optional.of("must not be blank");
		}
		var codePoints = name.codePoints().toArray();
		if (!hasVisibleCharacter(codePoints)) {
			return Optional.of("must not be blank");
		}
		if (codePoints.length > MAX_LENGTH) {
			return Optional.of("must be at most " + MAX_LENGTH + " characters");
		}
		if (!Arrays.equals(repair(codePoints), codePoints)) {
			return Optional.of("must not contain control, invisible or text-direction characters");
		}
		return Optional.empty();
	}

	/**
	 * Makes a name from a provider valid, because that sign-in can't be refused over a name: removes what
	 * {@link #problem} would reject, then cuts to {@value #MAX_LENGTH} characters between whole characters as
	 * people see them (never between an emoji and its skin tone, or inside a flag). Returns an empty string when
	 * nothing usable is left.
	 */
	static String clean(String name) {
		if (name == null) {
			return "";
		}
		var text = normalize(text(repair(name.codePoints().limit(INPUT_LIMIT).toArray())));
		if (text.codePointCount(0, text.length()) > MAX_LENGTH) {
			// Cutting can leave a joiner or mark at the end, so the cut text is repaired again.
			text = normalize(text(repair(cut(text).codePoints().toArray())));
		}
		return problem(text).isPresent() ? "" : text;
	}

	/** Removes every code point that is not allowed where it stands, until nothing more has to go. */
	private static int[] repair(int[] codePoints) {
		var current = codePoints;
		while (true) {
			var next = repairOnce(current);
			if (next.length == current.length) {
				return next;
			}
			current = next;
		}
	}

	private static int[] repairOnce(int[] in) {
		var out = new int[in.length];
		var size = 0;
		var stackedMarks = 0;
		for (var i = 0; i < in.length; i++) {
			var codePoint = in[i];
			if (codePoint == WAVING_BLACK_FLAG) {
				// A flag keeps its tag letters; they are invisible anywhere else.
				var end = tagSequenceEnd(in, i + 1);
				System.arraycopy(in, i, out, size, end - i);
				size += end - i;
				i = end - 1;
				stackedMarks = 0;
				continue;
			}
			var previous = size == 0 ? -1 : out[size - 1];
			var next = i + 1 < in.length ? in[i + 1] : -1;
			if (!isAllowed(codePoint, previous, next, stackedMarks)) {
				continue;
			}
			if (isVariationSelector(codePoint)) {
				// Draws nothing by itself, so it neither adds to nor ends a stack of marks.
			}
			else if (isMark(codePoint)) {
				stackedMarks++;
			}
			else {
				stackedMarks = 0;
			}
			out[size++] = codePoint;
		}
		return Arrays.copyOf(out, size);
	}

	private static boolean isAllowed(int codePoint, int previous, int next, int stackedMarks) {
		var type = Character.getType(codePoint);
		if (type == Character.SURROGATE || type == Character.PRIVATE_USE || codePoint == COMBINING_GRAPHEME_JOINER
				|| isTag(codePoint)) {
			return false;
		}
		if (codePoint == ZERO_WIDTH_JOINER || codePoint == ZERO_WIDTH_NON_JOINER) {
			return previous >= 0 && isVisible(previous) && next >= 0 && isVisible(next);
		}
		if (isVariationSelector(codePoint)) {
			return previous >= 0 && !isVariationSelector(previous) && (isEmojiSelector(codePoint)
					? isVisible(previous) && !Character.isLetter(previous)
					: Character.UnicodeScript.of(previous) == Character.UnicodeScript.HAN);
		}
		if (isInvisibleOrDirectional(codePoint)) {
			return false;
		}
		if (isMark(codePoint)) {
			return previous >= 0 && isVisible(previous) && stackedMarks < MAX_STACKED_MARKS;
		}
		return true;
	}

	/**
	 * Where a flag's tags end, when the tags right after the flag at {@code from - 1} are a real subdivision flag
	 * (2 to 7 tag letters or digits, then the cancel tag); otherwise {@code from}, meaning no tags belong to it.
	 */
	private static int tagSequenceEnd(int[] codePoints, int from) {
		var end = from;
		while (end < codePoints.length && isTagLetterOrDigit(codePoints[end])) {
			end++;
		}
		var length = end - from;
		if (length >= 2 && length <= 7 && end < codePoints.length && codePoints[end] == CANCEL_TAG) {
			return end + 1;
		}
		return from;
	}

	/** Cuts to {@value #MAX_LENGTH} code points at the last boundary between characters as people see them. */
	private static String cut(String text) {
		var boundaries = BreakIterator.getCharacterInstance(Locale.ROOT);
		boundaries.setText(text);
		var end = 0;
		for (var boundary = boundaries.next(); boundary != BreakIterator.DONE; boundary = boundaries.next()) {
			if (text.codePointCount(0, boundary) > MAX_LENGTH) {
				break;
			}
			end = boundary;
		}
		return text.substring(0, end);
	}

	private static String text(int[] codePoints) {
		return new String(codePoints, 0, codePoints.length);
	}

	private static boolean isSpace(int codePoint) {
		return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint);
	}

	private static boolean isInvisibleOrDirectional(int codePoint) {
		return switch (Character.getType(codePoint)) {
			case Character.CONTROL, Character.FORMAT, Character.LINE_SEPARATOR, Character.PARAGRAPH_SEPARATOR -> true;
			default -> false;
		};
	}

	/** Takes up room and shows something: not a space, control or format character. */
	private static boolean isVisible(int codePoint) {
		return !isSpace(codePoint) && !isInvisibleOrDirectional(codePoint);
	}

	private static boolean hasVisibleCharacter(int[] codePoints) {
		return Arrays.stream(codePoints).anyMatch(c -> isVisible(c) && !isMark(c));
	}

	private static boolean isMark(int codePoint) {
		return switch (Character.getType(codePoint)) {
			case Character.NON_SPACING_MARK, Character.COMBINING_SPACING_MARK, Character.ENCLOSING_MARK -> true;
			default -> false;
		};
	}

	private static boolean isTag(int codePoint) {
		return codePoint >= 0xE0000 && codePoint <= CANCEL_TAG;
	}

	private static boolean isTagLetterOrDigit(int codePoint) {
		return (codePoint >= 0xE0030 && codePoint <= 0xE0039) || (codePoint >= 0xE0061 && codePoint <= 0xE007A);
	}

	/** U+FE00 to U+FE0F and U+E0100 to U+E01EF. */
	private static boolean isVariationSelector(int codePoint) {
		return (codePoint >= 0xFE00 && codePoint <= 0xFE0F) || (codePoint >= 0xE0100 && codePoint <= 0xE01EF);
	}

	/** Text and emoji presentation: the two selectors emoji use. */
	private static boolean isEmojiSelector(int codePoint) {
		return codePoint == 0xFE0E || codePoint == 0xFE0F;
	}

}
