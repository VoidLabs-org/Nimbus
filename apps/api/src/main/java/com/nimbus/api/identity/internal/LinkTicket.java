package com.nimbus.api.identity.internal;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The ticket a connect started with ({@code /api/auth/oauth2/<provider>?link=<ticket>}), kept in the handshake's
 * short-lived HTTP session like {@link ReturnPath}. It never goes to the provider, and is gone with the handshake.
 */
final class LinkTicket {

	static final String PARAMETER = "link";

	private static final String ATTRIBUTE = LinkTicket.class.getName();

	private static final int MAX_LENGTH = 256;

	private LinkTicket() {
	}

	/** Keeps the request's ticket for the end of the handshake; otherwise forgets any earlier one. */
	static void remember(HttpServletRequest request) {
		var ticket = request.getParameter(PARAMETER);
		if (ticket != null && !ticket.isBlank() && ticket.length() <= MAX_LENGTH) {
			request.getSession().setAttribute(ATTRIBUTE, ticket);
			return;
		}
		var session = request.getSession(false);
		if (session != null) {
			session.removeAttribute(ATTRIBUTE);
		}
	}

	/** The ticket this handshake was started with, read before the handshake's session is dropped. */
	static Optional<String> recall(HttpServletRequest request) {
		var session = request.getSession(false);
		return session != null && session.getAttribute(ATTRIBUTE) instanceof String ticket ? Optional.of(ticket)
				: Optional.empty();
	}

}
