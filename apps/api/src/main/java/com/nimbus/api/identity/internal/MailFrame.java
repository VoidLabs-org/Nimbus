package com.nimbus.api.identity.internal;

import java.util.Optional;

/**
 * The layout every identity email shares: the "Ink header band" design (30e), a dark band with the logo and
 * heading over a light card, and a small footer. Built from tables and inline styles, which is what mail programs
 * support. {@link CodeMail} and {@link NoticeMail} fill the card with their own content.
 */
final class MailFrame {

	/** The class names the dark-mode rules in the page style target; the cards below use them. */
	static final String MUTED_STYLE = "font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;"
			+ "mso-line-height-rule:exactly;color:#6b6763";

	private MailFrame() {
	}

	/**
	 * @param title the subject; it is also the title, so it must not hold anything secret
	 * @param preview the hidden preview line inbox lists show, which must not hold anything secret either
	 * @param heading the large heading in the dark band
	 * @param logoUrl the public address of the Nimbus icon; without one the header shows an orange circle instead,
	 * because a mail program can't reach {@code localhost} and blocks images by default
	 * @param card the HTML inside the light card, already escaped
	 * @param footer the small print under the card
	 */
	static String html(String title, String preview, String heading, Optional<String> logoUrl, String card,
			String footer) {
		var logo = logoUrl
			.map(url -> "<img src=\"" + escape(url) + "\" width=\"28\" height=\"28\" alt=\"Nimbus\" "
					+ "style=\"display:block;width:28px;height:28px;border:0\">")
			.orElse("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>"
					+ "<td width=\"28\" height=\"28\" bgcolor=\"#ff6b3d\" style=\"width:28px;height:28px;"
					+ "border-radius:50%;background:#ff6b3d;font-size:0;line-height:0\">&nbsp;</td></tr></table>");
		return """
				<!DOCTYPE html>
				<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
				<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1">
				<meta name="color-scheme" content="light dark">
				<meta name="supported-color-schemes" content="light dark">
				<title>%1$s</title>
				<!--[if mso]><style>table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
				<style>
				@media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}.code{font-size:34px!important;letter-spacing:8px!important}}
				@media (prefers-color-scheme:dark){.bg{background:#121110!important}.card{background:#1d1b19!important}.ink,h1{color:#f4f2ef!important}.muted{color:#c9c4bf!important}.tile{background:#2a2725!important}.foot{color:#a8a29d!important}}
				</style>
				</head>
				<body style="margin:0;padding:0;background:#f4f2ef" class="bg">
				<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f2ef;opacity:0">%2$s&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" bgcolor="#f4f2ef" class="bg" style="background:#f4f2ef"><tr><td align="center" style="padding:40px 12px">
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%%;max-width:600px">
				<tr><td bgcolor="#201d1a" class="px" style="background:#201d1a;border-radius:28px 28px 0 0;padding:32px 40px 36px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">%3$s</td><td valign="middle" style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;font-size:20px;line-height:28px;font-weight:bold;color:#f4f2ef;letter-spacing:-0.3px">nimbus</td></tr></table>
				<h1 style="margin:28px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:36px;mso-line-height-rule:exactly;font-weight:bold;color:#f4f2ef;letter-spacing:-0.5px">%4$s</h1></td></tr>
				<tr><td bgcolor="#fffefc" class="card px" style="background:#fffefc;border-radius:0 0 28px 28px;padding:36px 40px 40px">
				%5$s
				</td></tr>
				<tr><td class="px foot" style="padding:24px 40px 0 40px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#878381">%6$s</td></tr>
				</table></td></tr></table>
				</body></html>
				""".formatted(escape(title), escape(preview), logo, escape(heading), card, escape(footer));
	}

	static String escape(String value) {
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

}
