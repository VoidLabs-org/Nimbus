package com.nimbus.api.mail;

import java.util.Optional;

/**
 * Where the images used in emails are hosted. An email can't carry its images and clients can't reach
 * {@code localhost}, so they are served from a public address ({@code MAIL_ASSETS_URL}).
 */
public interface MailAssets {

	/** The Nimbus icon for a dark background, e.g. the dark header of an email. */
	String NIMBUS_ICON_DARK = "nimbus-icon-dark.png";

	/**
	 * The public address of an image, or empty when no host is configured, in which case the email should do
	 * without the image.
	 *
	 * @param file the file name, e.g. {@code nimbus-icon-dark.png}
	 */
	Optional<String> url(String file);

}
