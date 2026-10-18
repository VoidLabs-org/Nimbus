package com.nimbus.api.identity.internal;

import static com.nimbus.api.identity.internal.MailFrame.MUTED_STYLE;
import static com.nimbus.api.identity.internal.MailFrame.escape;

import java.util.Optional;

/**
 * The emails that tell the User something happened to their account and point them at a page: the shared
 * {@link MailFrame} with a line of text, a tile with what to do if it wasn't them, and a button.
 */
final class NoticeMail {

	private NoticeMail() {
	}

	/**
	 * @param title the subject; it is also the title and the hidden preview line
	 * @param line what happened
	 * @param ifNotYou the tile under it: what to do if this wasn't the User
	 * @param button the label of the button, which opens {@code url}
	 * @param logoUrl see {@link MailFrame#html}
	 */
	static String html(String title, String heading, String line, String ifNotYou, String button, String url,
			String footer, Optional<String> logoUrl) {
		var card = """
				<p class="muted" style="margin:0 0 20px 0;%1$s">%2$s</p>
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin:0 0 24px 0"><tr><td class="tile muted" bgcolor="#f4f2ef" style="padding:14px 20px;border-radius:16px;background:#f4f2ef;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#6b6763">%3$s</td></tr></table>
				<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ff6b3d" style="border-radius:999px;background:#ff6b3d"><a href="%4$s" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#201d1a;text-decoration:none">%5$s</a></td></tr></table>"""
			.formatted(MUTED_STYLE, escape(line), escape(ifNotYou), escape(url), escape(button));
		return MailFrame.html(title, line, heading, logoUrl, card, footer);
	}

}
