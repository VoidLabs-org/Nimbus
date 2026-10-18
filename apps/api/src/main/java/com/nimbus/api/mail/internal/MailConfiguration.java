package com.nimbus.api.mail.internal;

import java.net.http.HttpClient;
import java.util.Optional;

import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** Picks how email leaves Nimbus: through Brevo when an API key is set, otherwise into the log. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(MailProperties.class)
class MailConfiguration {

	private static final Logger log = LoggerFactory.getLogger(MailConfiguration.class);

	@Bean
	MailAssets mailAssets(MailProperties properties) {
		var base = properties.assetsUrl();
		if (!base.isEmpty() && !base.startsWith("https://")) {
			// A mail program cannot load localhost, a relative path or (often) plain http: better no image.
			log.warn("MAIL_ASSETS_URL must be a public https address, so emails will carry no images (it is: {})", base);
			base = "";
		}
		var host = base;
		return file -> host.isEmpty() ? Optional.empty() : Optional.of(host + "/" + file);
	}

	@Bean
	Mailer mailer(MailProperties properties) {
		if (!properties.brevoConfigured()) {
			// Verification codes are written to the log in this mode, so it must never go unnoticed in production.
			log.warn("BREVO_API_KEY is not set: emails, Verification codes included, are written to the log, not sent");
			return new LoggingMailer();
		}
		if (properties.from().isBlank()) {
			throw new IllegalStateException("Set MAIL_FROM in apps/api/.env to a sender verified in Brevo (see .env.example)");
		}
		var requests = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(properties.timeout()).build());
		// For the JDK client this is the time to the whole response, not each read.
		requests.setReadTimeout(properties.timeout());
		return new BrevoMailer(RestClient.builder().requestFactory(requests).build(), properties);
	}

}
