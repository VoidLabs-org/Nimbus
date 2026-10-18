package com.nimbus.api.mail.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Mail settings.
 *
 * @param brevoApiKey Brevo API key (BREVO_API_KEY in .env); blank means emails are logged instead of sent
 * @param from the sender address (MAIL_FROM), which must be a verified sender in Brevo; required with a key
 * @param fromName the sender name recipients see (MAIL_FROM_NAME)
 * @param timeout how long to wait for Brevo to connect and to answer. Short, because the first code is sent on
 * the registration request
 */
@ConfigurationProperties("nimbus.mail")
record MailProperties(@DefaultValue("") String brevoApiKey, @DefaultValue("") String from,
		@DefaultValue("Nimbus") String fromName, @DefaultValue("5s") Duration timeout) {

	/** Whitespace pasted into .env is dropped, and an empty sender name (MAIL_FROM_NAME=) falls back to Nimbus. */
	MailProperties {
		brevoApiKey = brevoApiKey.strip();
		from = from.strip();
		fromName = fromName.isBlank() ? "Nimbus" : fromName.strip();
	}

	boolean brevoConfigured() {
		return !brevoApiKey.isBlank();
	}

}
