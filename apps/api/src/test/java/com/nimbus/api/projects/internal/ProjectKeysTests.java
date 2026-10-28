package com.nimbus.api.projects.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ProjectKeysTests {

	@Test
	void aKeyIsMatchedInAnyCaseAndStoredInCapitals() {
		assertThat(ProjectKeys.normalize("nIm")).contains("NIM");
		assertThat(ProjectKeys.normalize("A1")).contains("A1");
	}

	@ParameterizedTest
	// "ſ" (long s) and "ı" (dotless i) become S and I in upper case, so they would otherwise open SAM and NIM.
	@ValueSource(strings = { "ſam", "nım", "ßa", "İA", "", "A", "1AB", "A-B", "ABCDEFGHIJK", " AB", "AB " })
	void aKeyThatIsNotTwoToTenAsciiLettersOrDigitsStartingWithALetterMatchesNothing(String key) {
		assertThat(ProjectKeys.normalize(key)).isEmpty();
	}

	@Test
	void noKeyMatchesNothing() {
		assertThat(ProjectKeys.normalize(null)).isEmpty();
	}
}
