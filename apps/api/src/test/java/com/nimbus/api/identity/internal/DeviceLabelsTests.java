package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class DeviceLabelsTests {

	private final DeviceLabels labels = new DeviceLabels();

	@ParameterizedTest(name = "{0}")
	@CsvSource(delimiter = '|', textBlock = """
			Chrome on Windows | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36
			Edge on Windows | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0
			Firefox on Windows | Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0
			Opera on Windows | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0
			Safari on macOS | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15
			Chrome on macOS | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36
			Safari on iOS | Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1
			Chrome on iOS | Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1
			Chrome on Android | Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36
			Firefox on Android | Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0
			Samsung Internet on Android | Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36
			Chrome on Chrome OS | Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36
			Firefox on Linux | Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0
			""")
	void namesTheBrowserAndTheSystem(String expected, String userAgent) {
		assertThat(labels.of(userAgent)).isEqualTo(expected);
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { "   ", "garbage", "Mozilla/5.0" })
	void saysUnknownBrowserWhenNothingIsRecognised(String userAgent) {
		assertThat(labels.of(userAgent)).isEqualTo("Unknown browser");
	}

	@ParameterizedTest
	@ValueSource(strings = { "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })
	void neverShowsOtherWhenOnlyTheSystemIsKnown(String userAgent) {
		assertThat(labels.of(userAgent)).startsWith("Unknown browser on ").doesNotContain("Other");
	}

	@ParameterizedTest
	@ValueSource(strings = { "Firefox/132.0", "Mozilla/5.0 (compatible; Firefox/132.0)" })
	void showsJustTheBrowserWhenOnlyThatIsKnown(String userAgent) {
		assertThat(labels.of(userAgent)).isEqualTo("Firefox");
	}

}
