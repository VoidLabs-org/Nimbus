package com.nimbus.api.mail.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class MailConfigurationTests {

	private final MailConfiguration configuration = new MailConfiguration();

	@Test
	void aBlankKeyChoosesTheLoggingMailer() {
		assertThat(configuration.mailer(new MailProperties("", "", "Nimbus", Duration.ofSeconds(5), "")))
			.isInstanceOf(LoggingMailer.class);
		assertThat(configuration.mailer(new MailProperties("   ", "hello@nimbus.dev", "Nimbus", Duration.ofSeconds(5), "")))
			.isInstanceOf(LoggingMailer.class);
	}

	@Test
	void whitespaceAroundTheSettingsIsDroppedAndABlankNameBecomesNimbus() {
		var properties = new MailProperties(" key\r", " hello@nimbus.dev ", "  ", Duration.ofSeconds(5), "");

		assertThat(properties.brevoApiKey()).isEqualTo("key");
		assertThat(properties.from()).isEqualTo("hello@nimbus.dev");
		assertThat(properties.fromName()).isEqualTo("Nimbus");
		assertThat(new MailProperties("  ", "", "Nimbus", Duration.ofSeconds(5), "").brevoConfigured()).isFalse();
	}

	@Test
	void imagesAreServedFromTheConfiguredPublicAddress() {
		var hosted = new MailProperties("", "", "Nimbus", Duration.ofSeconds(5), " https://assets.example.dev/ ");
		var none = new MailProperties("", "", "Nimbus", Duration.ofSeconds(5), "");

		assertThat(configuration.mailAssets(hosted).url("nimbus-icon-dark.png"))
			.contains("https://assets.example.dev/nimbus-icon-dark.png");
		assertThat(configuration.mailAssets(none).url("nimbus-icon-dark.png")).isEmpty();
	}

	@Test
	void anAssetsAddressThatIsNotPublicHttpsIsIgnored() {
		for (var address : new String[] { "http://localhost:3000", "http://assets.example.dev", "/assets", "localhost" }) {
			var properties = new MailProperties("", "", "Nimbus", Duration.ofSeconds(5), address);

			assertThat(configuration.mailAssets(properties).url("nimbus-icon-dark.png")).as(address).isEmpty();
		}
	}

	@Test
	void aKeyChoosesBrevo() {
		assertThat(configuration
			.mailer(new MailProperties("key", "hello@nimbus.dev", "Nimbus", Duration.ofSeconds(5), "")))
			.isInstanceOf(BrevoMailer.class);
	}

	@Test
	void aKeyWithoutASenderAddressRefusesToStart() {
		assertThatThrownBy(
				() -> configuration.mailer(new MailProperties("key", "", "Nimbus", Duration.ofSeconds(5), "")))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("MAIL_FROM");
	}

}
