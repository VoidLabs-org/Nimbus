package com.nimbus.api.issues.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Random;

import org.junit.jupiter.api.Test;

class RankKeysTests {

	@Test
	void itMakesTheKeysTheFractionalIndexingReferenceMakes() {
		// Worked examples from the reference implementation (rocicorp/fractional-indexing), base 62.
		assertThat(RankKeys.between(null, null)).isEqualTo("a0");
		assertThat(RankKeys.between("a0", null)).isEqualTo("a1");
		assertThat(RankKeys.between(null, "a0")).isEqualTo("Zz");
		assertThat(RankKeys.between("a0", "a1")).isEqualTo("a0V");
		assertThat(RankKeys.between("a1", "a2")).isEqualTo("a1V");
		assertThat(RankKeys.between("a0V", "a1")).isEqualTo("a0l");
		assertThat(RankKeys.between("Zz", "a0")).isEqualTo("ZzV");
		assertThat(RankKeys.between("Zz", "a1")).isEqualTo("a0");
		assertThat(RankKeys.between(null, "Y00")).isEqualTo("Xzzz");
		assertThat(RankKeys.between("bzz", null)).isEqualTo("c000");
		assertThat(RankKeys.between("a0", "a0V")).isEqualTo("a0G");
		assertThat(RankKeys.between("a0", "a0G")).isEqualTo("a08");
		assertThat(RankKeys.between("b125", "b129")).isEqualTo("b127");
		assertThat(RankKeys.between("a0", "a1V")).isEqualTo("a1");
		assertThat(RankKeys.between("Zz", "a01")).isEqualTo("a0");
		assertThat(RankKeys.between(null, "a0V")).isEqualTo("a0");
		assertThat(RankKeys.between(null, "b999")).isEqualTo("b99");
	}

	@Test
	void keysMadeAnywhereInAListKeepItInOrder() {
		var random = new Random(232);
		var keys = new ArrayList<String>();
		for (int drop = 0; drop < 5_000; drop++) {
			int at = random.nextInt(keys.size() + 1);
			var key = RankKeys.between(at == 0 ? null : keys.get(at - 1), at == keys.size() ? null : keys.get(at));
			keys.add(at, key);
		}
		// Byte order, as the column's "C" collation compares them.
		var sorted = new ArrayList<>(keys);
		sorted.sort(Comparator.naturalOrder());
		assertThat(keys).isEqualTo(sorted).doesNotHaveDuplicates();
	}

	@Test
	void dropsIntoTheSameGapGrowTheKeyAboutOneCharacterPerFiveDrops() {
		// Always just below the same Issue, as when cards keep being dropped at the top of a column under one card.
		var above = "a0";
		var below = "a1";
		for (int drop = 0; drop < 300; drop++) {
			var key = RankKeys.between(above, below);
			assertThat(key).isGreaterThan(above).isLessThan(below);
			below = key;
		}
		assertThat(below.length()).isBetween(45, 70);
	}

	@Test
	void appendedKeysStayShortAndInOrder() {
		var keys = RankKeys.sequence(10_000);
		assertThat(keys.subList(0, 3)).containsExactly("a0", "a1", "a2");
		assertThat(keys.get(61)).isEqualTo("az");
		assertThat(keys.get(62)).isEqualTo("b00");
		var sorted = new ArrayList<>(keys);
		sorted.sort(Comparator.naturalOrder());
		assertThat(keys).isEqualTo(sorted).doesNotHaveDuplicates();
		assertThat(keys.getLast()).hasSize(4);
	}

	@Test
	void itRefusesKeysItWouldNeverMakeAndBoundsOutOfOrder() {
		for (var bad : new String[] { "", "a", "a00", "a0 ", "!0", "A00000000000000000000000000" }) {
			assertThatIllegalArgumentException().as(bad).isThrownBy(() -> RankKeys.between(bad, null));
		}
		assertThatIllegalArgumentException().isThrownBy(() -> RankKeys.between("a1", "a0"));
		assertThatIllegalArgumentException().isThrownBy(() -> RankKeys.between("a1", "a1"));
	}

}
