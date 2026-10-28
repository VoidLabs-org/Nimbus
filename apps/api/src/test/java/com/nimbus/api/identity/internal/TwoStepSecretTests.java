package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/** The API refuses to start without a usable TWO_STEP_SECRET, and says which setting to fix. */
class TwoStepSecretTests {

	@Test
	void aMissingSecretStopsStartup() {
		assertThatIllegalStateException().isThrownBy(() -> new TwoStepSecrets(properties(null)))
			.withMessageContaining("TWO_STEP_SECRET");
		assertThatIllegalStateException().isThrownBy(() -> new TwoStepSecrets(properties("  ")))
			.withMessageContaining("TWO_STEP_SECRET");
	}

	@Test
	void aSecretThatIsNotBase64OrTooShortStopsStartup() {
		assertThatIllegalStateException().isThrownBy(() -> new TwoStepSecrets(properties("not base64!")))
			.withMessageContaining("TWO_STEP_SECRET");
		var short31 = Base64.getEncoder().encodeToString(new byte[31]);
		assertThatIllegalStateException().isThrownBy(() -> new TwoStepSecrets(properties(short31)))
			.withMessageContaining("TWO_STEP_SECRET");
	}

	private static AuthProperties properties(String twoStepSecret) {
		Map<String, String> values = new HashMap<>();
		values.put("nimbus.auth.jwt-secret", "unused");
		if (twoStepSecret != null) {
			values.put("nimbus.auth.two-step-secret", twoStepSecret);
		}
		return new Binder(new MapConfigurationPropertySource(values)).bindOrCreate("nimbus.auth", AuthProperties.class);
	}

}
