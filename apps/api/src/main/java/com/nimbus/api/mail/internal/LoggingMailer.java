package com.nimbus.api.mail.internal;

import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Writes each email to the log instead of sending it, so Nimbus works locally without a mail service. */
@Component
class LoggingMailer implements Mailer {

	private static final Logger log = LoggerFactory.getLogger(LoggingMailer.class);

	@Override
	public void send(Mail mail) {
		log.info("Email not sent (no mail service is configured). To: {}, subject: {}\n{}", mail.to(), mail.subject(),
				mail.text());
	}

}
