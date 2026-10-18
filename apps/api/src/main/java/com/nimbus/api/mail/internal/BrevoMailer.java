package com.nimbus.api.mail.internal;

import java.util.List;
import java.util.Map;

import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Sends email through Brevo's transactional API, with our own HTML and text (no Brevo-hosted templates). A
 * failure is logged with Brevo's reason and never thrown or retried.
 */
class BrevoMailer implements Mailer {

	static final String SEND_URL = "https://api.brevo.com/v3/smtp/email";

	private static final int MAX_LOGGED_BODY = 500;

	private static final Logger log = LoggerFactory.getLogger(BrevoMailer.class);

	private final RestClient client;

	private final MailProperties properties;

	BrevoMailer(RestClient client, MailProperties properties) {
		this.client = client;
		this.properties = properties;
	}

	@Override
	public void send(Mail mail) {
		try {
			var body = Map.of(
					"sender", Map.of("email", properties.from(), "name", properties.fromName()),
					"to", List.of(Map.of("email", mail.to())),
					"subject", mail.subject(),
					"htmlContent", mail.html(),
					"textContent", mail.text());
			var response = client.post()
				.uri(SEND_URL)
				.header("api-key", properties.brevoApiKey())
				.contentType(MediaType.APPLICATION_JSON)
				.accept(MediaType.APPLICATION_JSON)
				.body(body)
				.retrieve()
				.body(Map.class);
			log.debug("Brevo accepted an email, messageId {}", response == null ? null : response.get("messageId"));
		}
		catch (RestClientResponseException e) {
			log.warn("Could not send an email to {} (subject: {}): Brevo answered {} {}", mail.to(), mail.subject(),
					e.getStatusCode().value(), abbreviated(e.getResponseBodyAsString()));
		}
		catch (RuntimeException e) {
			// A timeout, a refused connection, an unreadable answer. The message never holds the API key.
			log.warn("Could not send an email to {} (subject: {}): {}", mail.to(), mail.subject(), e.toString());
		}
	}

	/** An error page from a proxy can be large; the start says what went wrong. */
	private static String abbreviated(String body) {
		return body.length() <= MAX_LOGGED_BODY ? body : body.substring(0, MAX_LOGGED_BODY) + "…";
	}

}
