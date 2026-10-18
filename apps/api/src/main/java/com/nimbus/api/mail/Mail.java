package com.nimbus.api.mail;

/**
 * One email to one person.
 *
 * @param to the recipient's address
 * @param subject the subject line
 * @param html the HTML body
 * @param text the same message as plain text, for mail programs that don't show HTML
 */
public record Mail(String to, String subject, String html, String text) {
}
