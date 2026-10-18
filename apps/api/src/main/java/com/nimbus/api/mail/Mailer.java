package com.nimbus.api.mail;

/**
 * Sends email. It knows nothing about Users or why a message is sent: callers write the message.
 *
 * <p>Callers should send after their transaction has committed, and never put anything secret in a domain event
 * to be mailed later, because events are stored.
 */
public interface Mailer {

	/**
	 * Sends the message. A delivery failure is logged and never thrown, so a mail problem can't undo what the
	 * caller already did; nothing is retried.
	 */
	void send(Mail mail);

}
