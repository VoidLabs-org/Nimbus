package com.nimbus.api.identity.internal;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Finishes, in one of the apps, a provider sign-in or connect that happened in a browser: the Desktop app's system
 * browser (ADR 0008) or the Mobile app's in-app browser. The browser only carried a one-time code ({@link AppCodes});
 * here the app trades it, with its verifier, for what the browser would have got. Everything a sign-in reads about
 * the device happens here, from the app's own request: Two-step verification and its remembered devices, the
 * Session's device label, the tokens it gets.
 */
@Service
class AppSignIn {

	private static final Logger log = LoggerFactory.getLogger(AppSignIn.class);

	private final AppCodes codes;

	private final ExternalSignIn externalSignIn;

	private final TwoStepSignIn twoStepSignIn;

	private final LinkTickets tickets;

	AppSignIn(AppCodes codes, ExternalSignIn externalSignIn, TwoStepSignIn twoStepSignIn, LinkTickets tickets) {
		this.codes = codes;
		this.externalSignIn = externalSignIn;
		this.twoStepSignIn = twoStepSignIn;
		this.tickets = tickets;
	}

	/**
	 * Signs the provider's account in, as the callback does in a browser: a User with Two-step verification gets a
	 * pending sign-in instead of a Session.
	 *
	 * @param rememberedTokens the app's remembered devices: the Desktop app's {@link RememberedBrowsers#COOKIE}, or
	 * each User's token the Mobile app keeps (it can't know beforehand whom the provider signs in as); the one that
	 * remembers this User skips the code
	 * @param userAgent the app's {@code User-Agent}, kept with the Session; may be null
	 * @throws FailedException {@code expired} for a code that is unknown, used, expired, a connect's, or given with
	 * the wrong verifier; {@code email_unverified} and {@code disconnected} as on the sign-in page; {@code failed} for
	 * anything else
	 */
	Outcome signIn(String code, String verifier, List<String> rememberedTokens, String userAgent) {
		var handoff = codes.take(code, verifier).filter(found -> found.linkTicket() == null)
			.orElseThrow(() -> new FailedException("expired"));
		var profile = handoff.profile();
		try {
			var pending = externalSignIn.whoSignsIn(profile)
				.flatMap(existing -> twoStepSignIn.begin(existing, profile, rememberedTokens));
			if (pending.isPresent()) {
				return new Outcome(null, pending.get());
			}
			return new Outcome(externalSignIn.startSession(profile, userAgent), null);
		}
		catch (ExternalSignIn.EmailUnverifiedException e) {
			throw new FailedException("email_unverified");
		}
		catch (ExternalSignIn.ProviderDisconnectedException e) {
			throw new FailedException("disconnected");
		}
		catch (RuntimeException e) {
			// As the callback does in a browser: anything else is a failed sign-in, logged, with the code used up.
			log.warn("Sign-in with a provider for an app failed", e);
			throw new FailedException("failed");
		}
	}

	/**
	 * Connects the provider's account to the signed-in User who asked from the Security page. The connect's ticket
	 * must be one this User's Session asked for: the code standing in for the browser cookie a connect in a browser
	 * is bound to.
	 *
	 * @return the provider connected
	 * @throws FailedException {@code expired} for a code as in {@link #signIn}, a sign-in's code, or a ticket that is
	 * used, expired or another Session's; {@code email_unverified}, {@code already_linked} and
	 * {@code already_connected} as on the Security page; {@code failed} for anything else
	 */
	String connect(String code, String verifier, UUID userId, UUID sessionId) {
		var handoff = codes.take(code, verifier).filter(found -> found.linkTicket() != null)
			.orElseThrow(() -> new FailedException("expired"));
		var profile = handoff.profile();
		tickets.redeemFor(handoff.linkTicket(), profile.provider(), userId, sessionId)
			.orElseThrow(() -> new FailedException("expired"));
		try {
			externalSignIn.connect(userId, sessionId, profile);
			return profile.provider();
		}
		catch (ExternalSignIn.EmailUnverifiedException e) {
			throw new FailedException("email_unverified");
		}
		catch (ExternalSignIn.AlreadyLinkedException e) {
			throw new FailedException("already_linked");
		}
		catch (ExternalSignIn.ProviderAlreadyConnectedException e) {
			throw new FailedException("already_connected");
		}
		catch (ExternalSignIn.ConnectExpiredException e) {
			throw new FailedException("expired");
		}
		catch (RuntimeException e) {
			log.warn("Connecting a provider for an app failed", e);
			throw new FailedException("failed");
		}
	}

	/**
	 * Either a Session started or a Sign-in code is needed first.
	 *
	 * @param started the User and the new Session's first refresh token; null while Two-step verification waits
	 * @param pendingId the pending sign-in, for its cookie or the Mobile app's {@code pendingToken}; null when the
	 * Session started
	 */
	record Outcome(ExternalSignIn.Started started, String pendingId) {
	}

	/** Becomes a 400 with the {@code code}, which the web app shows like the one the browser's sign-in page gets. */
	static class FailedException extends RuntimeException {

		private final String code;

		FailedException(String code) {
			super("Signing in from the app didn't finish. Try again.");
			this.code = code;
		}

		String code() {
			return code;
		}

	}

}
