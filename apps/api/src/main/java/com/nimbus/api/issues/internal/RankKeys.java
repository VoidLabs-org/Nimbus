package com.nimbus.api.issues.internal;

import java.util.ArrayList;
import java.util.List;

/**
 * Makes Rank keys: short base 62 strings that sort byte by byte (the {@code rank} column is {@code COLLATE "C"}), so a
 * key can always be made between two others without touching them. See ADR 0012.
 * <p>
 * This is fractional indexing as in rocicorp/fractional-indexing. A key is an integer part, whose first character says
 * its length ({@code a} is one digit, {@code b} two, …; {@code Z} one digit, {@code Y} two, … below them), followed by
 * a fraction that never ends in {@code 0}. Appending after the last key only increments the integer part, so a project
 * whose Issues are added one after another keeps keys of a few characters; only repeated drops into the same gap grow
 * the fraction.
 */
final class RankKeys {

	private static final String DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

	private static final char ZERO = DIGITS.charAt(0);

	private static final char LAST = DIGITS.charAt(DIGITS.length() - 1);

	/** The smallest integer part, which nothing can be made before. */
	private static final String SMALLEST = "A" + String.valueOf(ZERO).repeat(26);

	private RankKeys() {
	}

	/**
	 * A key after {@code before} and before {@code after}; {@code null} means no bound on that side. Both null gives
	 * the first key, {@code a0}.
	 *
	 * @throws IllegalArgumentException if a key isn't one this class makes, or {@code before} isn't below {@code after}
	 */
	static String between(String before, String after) {
		if (before != null) validate(before);
		if (after != null) validate(after);
		if (before != null && after != null && before.compareTo(after) >= 0) {
			throw new IllegalArgumentException(before + " is not below " + after);
		}
		if (before == null) {
			if (after == null) return "a" + ZERO;
			var integer = integerPart(after);
			var fraction = after.substring(integer.length());
			if (integer.equals(SMALLEST)) return integer + midpoint("", fraction);
			if (integer.length() < after.length()) return integer;
			var smaller = decrement(integer);
			if (smaller == null) throw new IllegalArgumentException("Nothing comes before " + after);
			return smaller;
		}
		if (after == null) {
			var integer = integerPart(before);
			var larger = increment(integer);
			return larger != null ? larger : integer + midpoint(before.substring(integer.length()), null);
		}
		var integerBefore = integerPart(before);
		var integerAfter = integerPart(after);
		if (integerBefore.equals(integerAfter)) {
			return integerBefore + midpoint(before.substring(integerBefore.length()), after.substring(integerAfter.length()));
		}
		var larger = increment(integerBefore);
		if (larger == null) throw new IllegalArgumentException("Nothing comes after " + before);
		if (larger.compareTo(after) < 0) return larger;
		return integerBefore + midpoint(before.substring(integerBefore.length()), null);
	}

	/** {@code count} keys in increasing order, each the one {@link #between} makes after the one before it. */
	static List<String> sequence(int count) {
		var keys = new ArrayList<String>(count);
		String last = null;
		for (int index = 0; index < count; index++) {
			last = between(last, null);
			keys.add(last);
		}
		return keys;
	}

	/** A fraction between {@code a} and {@code b} ({@code null}: no upper bound); neither ends in zero. */
	private static String midpoint(String a, String b) {
		if (b != null) {
			// Shared leading digits stay; a running out counts as zeros.
			int n = 0;
			while (n < b.length() && (n < a.length() ? a.charAt(n) : ZERO) == b.charAt(n)) n++;
			if (n > 0) {
				return b.substring(0, n) + midpoint(n < a.length() ? a.substring(n) : "", b.substring(n));
			}
		}
		int digitA = a.isEmpty() ? 0 : DIGITS.indexOf(a.charAt(0));
		int digitB = b != null ? DIGITS.indexOf(b.charAt(0)) : DIGITS.length();
		if (digitB - digitA > 1) return String.valueOf(DIGITS.charAt((digitA + digitB + 1) / 2));
		if (b != null && b.length() > 1) return b.substring(0, 1);
		return DIGITS.charAt(digitA) + midpoint(a.isEmpty() ? "" : a.substring(1), null);
	}

	private static int integerLength(char head) {
		if (head >= 'a' && head <= 'z') return head - 'a' + 2;
		if (head >= 'A' && head <= 'Z') return 'Z' - head + 2;
		throw new IllegalArgumentException("Not a Rank key head: " + head);
	}

	private static String integerPart(String key) {
		int length = integerLength(key.charAt(0));
		if (length > key.length()) throw new IllegalArgumentException("Not a Rank key: " + key);
		return key.substring(0, length);
	}

	private static void validate(String key) {
		if (key.isEmpty() || key.equals(SMALLEST)) throw new IllegalArgumentException("Not a Rank key: " + key);
		var integer = integerPart(key);
		for (int index = 1; index < key.length(); index++) {
			if (DIGITS.indexOf(key.charAt(index)) < 0) throw new IllegalArgumentException("Not a Rank key: " + key);
		}
		if (key.length() > integer.length() && key.charAt(key.length() - 1) == ZERO) {
			throw new IllegalArgumentException("Not a Rank key: " + key);
		}
	}

	/** The next integer part, or {@code null} past the largest. */
	private static String increment(String integer) {
		char head = integer.charAt(0);
		var digits = new StringBuilder(integer.substring(1));
		for (int index = digits.length() - 1; index >= 0; index--) {
			int digit = DIGITS.indexOf(digits.charAt(index)) + 1;
			if (digit < DIGITS.length()) {
				digits.setCharAt(index, DIGITS.charAt(digit));
				return head + digits.toString();
			}
			digits.setCharAt(index, ZERO);
		}
		// Every digit carried over: the next head, one digit longer above "a", one shorter below it.
		if (head == 'Z') return "a" + ZERO;
		if (head == 'z') return null;
		char next = (char) (head + 1);
		if (next > 'a') digits.append(ZERO);
		else digits.setLength(digits.length() - 1);
		return next + digits.toString();
	}

	/** The previous integer part, or {@code null} below the smallest. */
	private static String decrement(String integer) {
		char head = integer.charAt(0);
		var digits = new StringBuilder(integer.substring(1));
		for (int index = digits.length() - 1; index >= 0; index--) {
			int digit = DIGITS.indexOf(digits.charAt(index)) - 1;
			if (digit >= 0) {
				digits.setCharAt(index, DIGITS.charAt(digit));
				return head + digits.toString();
			}
			digits.setCharAt(index, LAST);
		}
		if (head == 'a') return "Z" + LAST;
		if (head == 'A') return null;
		char previous = (char) (head - 1);
		if (previous < 'Z') digits.append(LAST);
		else digits.setLength(digits.length() - 1);
		return previous + digits.toString();
	}

}
