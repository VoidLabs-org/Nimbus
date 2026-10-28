package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.mail.Mail;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.core.authority.AuthorityUtils;

/**
 * What the browser gets back after Google redirects to us: where it is sent, and the refresh cookie that lets
 * the web app finish signing in. The real Google handshake is checked by hand.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@org.springframework.test.context.event.RecordApplicationEvents
class OAuthLoginHandlerTests {

	@Autowired
	OAuthLoginHandler handler;

	@Autowired
	Sessions sessions;

	@Autowired
	LinkTickets tickets;

	@Autowired
	LinkedIdentities linkedIdentities;

	@Autowired
	Registration registration;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	org.springframework.test.context.event.ApplicationEvents events;

	@org.junit.jupiter.params.ParameterizedTest
	@org.junit.jupiter.params.provider.ValueSource(strings = { "google", "github" })
	void providerSignUpSendsNoAlertButReturningSignInDoes(String provider) throws Exception {
		var email = "handler-signin-alert-" + provider + "@example.com";
		var login = providerLogin(provider, email);
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), new MockHttpServletResponse(), login);
		assertThat(events.stream(com.nimbus.api.identity.SignedIn.class)).isEmpty();
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), new MockHttpServletResponse(), login);
		assertThat(events.stream(com.nimbus.api.identity.SignedIn.class)).hasSize(1);
	}

	@org.junit.jupiter.params.ParameterizedTest
	@org.junit.jupiter.params.provider.ValueSource(strings = { "google", "github" })
	void firstProviderSignInToAnExistingUserDoesPublishSignedIn(String provider) throws Exception {
		var email = "handler-existing-signin-" + provider + "@example.com";
		var user = registration.create("Existing", email, "correct horse");
		handler.onAuthenticationSuccess(new MockHttpServletRequest(), new MockHttpServletResponse(), providerLogin(provider, email));
		assertThat(events.stream(com.nimbus.api.identity.SignedIn.class)).singleElement()
			.satisfies(event -> assertThat(event.userId()).isEqualTo(user.getId()));
	}

	private static OAuth2AuthenticationToken providerLogin(String provider, String email) {
		if (provider.equals("google")) return google(claims(email, email, true));
		var attributes = Map.<String, Object>of("id", email, "login", "ada-codes", "emails",
			List.of(Map.of("email", email, "primary", true, "verified", true)));
		return new OAuth2AuthenticationToken(new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OAUTH2_USER"), attributes, "id"), List.of(), "github");
	}

	@Test
	void successSetsARefreshCookieThatWorksAndRedirectsWithoutAnyTokenInTheUrl() throws Exception {
		var request = new MockHttpServletRequest();
		var oauthSession = new MockHttpSession();
		request.setSession(oauthSession);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(request, response, google(recorded("verified-user")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/auth/callback");
		var setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
		assertThat(setCookie).startsWith("refresh_token=").contains("HttpOnly").contains("Secure")
			.contains("SameSite=Strict").contains("Path=/api/auth");
		var token = setCookie.substring("refresh_token=".length(), setCookie.indexOf(';'));
		assertThat(sessions.refresh(token, "client-google").user().email()).isEqualTo("ada.lovelace@example.com");
		assertThat(oauthSession.isInvalid()).as("the handshake session ends with the handshake").isTrue();
	}

	@Test
	void theSessionRemembersWhichBrowserSignedIn() throws Exception {
		var request = new MockHttpServletRequest();
		request.addHeader(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
				+ "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(request, response, google(recorded("verified-user")));

		var setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
		var refreshed = sessions.refresh(setCookie.substring("refresh_token=".length(), setCookie.indexOf(';')),
				"client-google-agent");
		assertThat(sessions.listFor(refreshed.user().getId(), refreshed.token().sessionId()))
			.extracting(Sessions.SessionView::device)
			.contains("Chrome on Windows");
	}

	@Test
	void anUnverifiedEmailRedirectsToLoginWithTheCodeAndSetsNoCookie() throws Exception {
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response,
				google(recorded("unverified-user")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=email_unverified&provider=google");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
	}

	@Test
	void theUserDecliningAtTheProviderRedirectsToLoginAsCancelled() throws Exception {
		var request = new MockHttpServletRequest();
		request.setRequestURI("/api/auth/oauth2/callback/github");
		var oauthSession = new MockHttpSession();
		request.setSession(oauthSession);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(request, response,
				new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=cancelled&provider=github");
		assertThat(oauthSession.isInvalid()).isTrue();
	}

	@Test
	void anyOtherFailureRedirectsToLoginAsFailed() throws Exception {
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(new MockHttpServletRequest(), response,
				new OAuth2AuthenticationException(new OAuth2Error("invalid_token_response")));
		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=failed");

		var other = new MockHttpServletResponse();
		handler.onAuthenticationFailure(new MockHttpServletRequest(), other, new AuthenticationException("boom") {
		});
		assertThat(other.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=failed");
	}

	@Test
	void successGoesBackToThePageTheSignInStartedFrom() throws Exception {
		var request = startedFrom("/projects/42?tab=board#top");
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(request, response, google(recorded("verified-user")));

		assertThat(response.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/auth/callback?returnTo=%2Fprojects%2F42%3Ftab%3Dboard%23top");
		assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).startsWith("refresh_token=");
	}

	@Test
	void aFailedSignInKeepsThePageForTheNextTry() throws Exception {
		var unverified = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(startedFrom("/projects/42"), unverified, google(recorded("unverified-user")));
		assertThat(unverified.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/login?error=email_unverified&provider=google&returnTo=%2Fprojects%2F42");

		var request = startedFrom("/projects/42");
		request.setRequestURI("/api/auth/oauth2/callback/github");
		var declined = new MockHttpServletResponse();
		handler.onAuthenticationFailure(request, declined,
				new OAuth2AuthenticationException(new OAuth2Error("access_denied")));
		assertThat(declined.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/login?error=cancelled&provider=github&returnTo=%2Fprojects%2F42");
	}

	@Test
	void withATicketSuccessLinksTheAccountAndGoesBackToSecurityWithNoCookie() throws Exception {
		var user = registration.create("Con", "handler-con@example.com", "correct horse");
		var session = sessions.start(user, null, false);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(connecting(user, session, "google"), response,
				google(claims("g-handler-1", "handler-con.work@example.com", true)));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/settings/security?connected=google");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
		assertThat(linkedIdentities.listFor(user.getId())).hasSize(1);
		var mails = RecordingMailer.sentTo("handler-con@example.com");
		assertThat(mails).extracting(Mail::subject).contains("Google was connected to your Nimbus account");
		assertThat(mails).filteredOn(mail -> mail.subject().contains("connected")).singleElement().satisfies(mail -> {
			assertThat(mail.html()).contains(RecordingMailer.IMAGE_HOST + "/nimbus-icon-dark.png")
				.contains("Google connected").contains("Review sign-in methods");
			assertThat(mail.text()).contains("/settings/security");
		});
		assertThat(sessions.isActive(session.sessionId(), user.getId())).isTrue();
	}

	@Test
	void withATicketAFailureGoesBackToSecurityWithTheCodeAndProvider() throws Exception {
		var user = registration.create("Con", "handler-fail@example.com", "correct horse");
		var session = sessions.start(user, null, false);

		var unverified = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(connecting(user, session, "google"), unverified,
				google(claims("g-handler-2", "handler-fail@example.com", false)));
		assertThat(unverified.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/settings/security?error=email_unverified&provider=google");

		var owner = externalSignIn.signIn(
				new ExternalProfile("google", "g-handler-3", "handler-owner@example.com", true, "Own", null, "own"));
		var taken = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(connecting(user, session, "google"), taken,
				google(claims("g-handler-3", "handler-owner@example.com", true)));
		assertThat(taken.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/settings/security?error=already_linked&provider=google");
		assertThat(linkedIdentities.listFor(owner.getId())).hasSize(1);
		assertThat(linkedIdentities.listFor(user.getId())).isEmpty();
		assertThat(RecordingMailer.sentTo("handler-fail@example.com")).extracting(Mail::subject)
			.noneMatch(subject -> subject.contains("connected"));

		var declined = connecting(user, session, "github");
		declined.setRequestURI("/api/auth/oauth2/callback/github");
		var cancelled = new MockHttpServletResponse();
		handler.onAuthenticationFailure(declined, cancelled,
				new OAuth2AuthenticationException(new OAuth2Error("access_denied")));
		assertThat(cancelled.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/settings/security?error=cancelled&provider=github");
	}

	@Test
	void anotherAccountOfAProviderTheUserHasIsAlreadyConnectedNotAlreadyLinked() throws Exception {
		var user = externalSignIn.signIn(
				new ExternalProfile("google", "g-handler-7", "handler-two@example.com", true, "Two", null, "two"));
		var session = sessions.start(user, null, false);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(connecting(user, session, "google"), response,
				google(claims("g-handler-8", "handler-two.work@example.com", true)));

		assertThat(response.getRedirectedUrl())
			.isEqualTo("http://localhost:3000/settings/security?error=already_connected&provider=google");
	}

	@Test
	void aTicketThatIsUnknownUsedOrFromAnEndedSessionIsExpired() throws Exception {
		var user = registration.create("Con", "handler-exp@example.com", "correct horse");
		var session = sessions.start(user, null, false);
		var expired = "http://localhost:3000/settings/security?error=expired&provider=google";

		var unknown = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(connectingWith("not-a-ticket", "any-binder"), unknown,
				google(claims("g-handler-4", "handler-exp@example.com", true)));
		assertThat(unknown.getRedirectedUrl()).isEqualTo(expired);

		var issued = tickets.issue(user.getId(), session.sessionId(), "google");
		handler.onAuthenticationSuccess(connectingWith(issued.ticket(), issued.binder()), new MockHttpServletResponse(),
				google(claims("g-handler-4", "handler-exp@example.com", true)));
		var used = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(connectingWith(issued.ticket(), issued.binder()), used,
				google(claims("g-handler-5", "handler-exp@example.com", true)));
		assertThat(used.getRedirectedUrl()).isEqualTo(expired);

		var other = registration.create("End", "handler-end@example.com", "correct horse");
		var otherSession = sessions.start(other, null, false);
		var ended = connecting(other, otherSession, "google");
		sessions.endAll(other);
		var response = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(ended, response,
				google(claims("g-handler-6", "handler-end@example.com", true)));
		assertThat(response.getRedirectedUrl()).isEqualTo(expired);
		assertThat(linkedIdentities.listFor(other.getId())).isEmpty();
	}

	// A link carrying somebody's ticket, opened in a browser that never asked for it, connects nothing.
	@Test
	void aTicketFollowedInAnotherBrowserOrForAnotherProviderIsExpired() throws Exception {
		var user = registration.create("Con", "handler-csrf@example.com", "correct horse");
		var session = sessions.start(user, null, false);
		var expired = "http://localhost:3000/settings/security?error=expired&provider=google";

		var issued = tickets.issue(user.getId(), session.sessionId(), "google");
		var noCookie = new MockHttpServletRequest();
		noCookie.setSession(new MockHttpSession());
		noCookie.setParameter(LinkTicket.PARAMETER, issued.ticket());
		LinkTicket.remember(noCookie);
		var victim = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(noCookie, victim,
				google(claims("g-handler-9", "victim@example.com", true)));
		assertThat(victim.getRedirectedUrl()).isEqualTo(expired);

		var github = tickets.issue(user.getId(), session.sessionId(), "github");
		var wrongProvider = new MockHttpServletResponse();
		handler.onAuthenticationSuccess(connectingWith(github.ticket(), github.binder()), wrongProvider,
				google(claims("g-handler-10", "handler-csrf@example.com", true)));
		assertThat(wrongProvider.getRedirectedUrl()).isEqualTo(expired);
		assertThat(linkedIdentities.listFor(user.getId())).isEmpty();
	}

	// A handshake started from the Security page with ?link=<ticket>, in the browser that was given the cookie.
	private MockHttpServletRequest connecting(User user, Sessions.IssuedToken session, String provider) {
		var issued = tickets.issue(user.getId(), session.sessionId(), provider);
		return connectingWith(issued.ticket(), issued.binder());
	}

	private static MockHttpServletRequest connectingWith(String ticket, String binder) {
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(LinkTicket.PARAMETER, ticket);
		LinkTicket.remember(request);
		request.removeParameter(LinkTicket.PARAMETER);
		request.setCookies(new Cookie(LinkTickets.COOKIE, binder));
		return request;
	}

	private static Map<String, Object> claims(String sub, String email, boolean verified) {
		return Map.of("sub", sub, "email", email, "email_verified", verified, "name", "Someone");
	}

	// A handshake started from /login?returnTo=<page>, as ReturnPathAuthorizationRequestResolver leaves it.
	private static MockHttpServletRequest startedFrom(String page) {
		var request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.setParameter(ReturnPath.PARAMETER, page);
		ReturnPath.remember(request);
		request.removeParameter(ReturnPath.PARAMETER);
		return request;
	}

	private static OAuth2AuthenticationToken google(Map<String, Object> claims) {
		var user = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OIDC_USER"), claims, "sub");
		return new OAuth2AuthenticationToken(user, List.of(), "google");
	}

	private static Map<String, Object> recorded(String name) throws IOException {
		try (var json = OAuthLoginHandlerTests.class.getResourceAsStream("/google/" + name + ".json")) {
			return JsonPath.parse(json).read("$");
		}
	}

}
