package com.nimbus.api.identity.internal;

import static com.nimbus.api.identity.internal.MailFrame.MUTED_STYLE;
import static com.nimbus.api.identity.internal.MailFrame.escape;

import java.time.Duration;
import java.util.Optional;

/**
 * The emails that carry a code (a Verification code, a Reset code): the shared {@link MailFrame} with the code in
 * large type. Each email supplies its own wording.
 */
final class CodeMail {

	private CodeMail() {
	}

	/**
	 * @param title the subject; it is also the title and the hidden preview line, so it must not hold the code
	 * @param codeLabel the sentence directly before the code
	 * @param logoUrl see {@link MailFrame#html}
	 */
	static String html(String title, String heading, String line, String codeLabel, String code, String footer,
			Duration lifetime, Optional<String> logoUrl) {
		var card = """
				<p class="muted" style="margin:0 0 16px 0;%1$s">%2$s</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin:4px 0 20px 0"><tr><td align="center" class="tile" bgcolor="#f4f2ef" style="background:#f4f2ef;border-radius:20px;padding:22px 16px"><div class="muted" style="margin:0 0 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#6b6763">%3$s</div><span class="code ink" style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:44px;line-height:56px;font-weight:bold;letter-spacing:12px;color:#201d1a;white-space:nowrap">%4$s</span></td></tr></table>
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%"><tr><td class="tile muted" bgcolor="#f4f2ef" style="padding:14px 20px;border-radius:16px;background:#f4f2ef;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#6b6763"><b class="ink" style="color:#201d1a">Nimbus will never ask for this code</b> by phone, chat or email.</td></tr></table>"""
			.formatted(MUTED_STYLE, escape(line), escape(codeLabel), escape(code));
		return MailFrame.html(title, title + ". It expires in " + lifetime.toMinutes() + " minutes.", heading, logoUrl,
				card, footer);
	}

}
