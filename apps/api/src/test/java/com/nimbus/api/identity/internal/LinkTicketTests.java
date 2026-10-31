package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Asking for the ticket that lets a full page load start connecting a provider. Providers are not faked over
 * HTTP: the profile is what the provider would have said, handed to the entry point the OAuth success handler uses.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class LinkTicketTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	MovableClock clock;

	@Autowired
	LinkTickets tickets;

	@Test
	void aFreshSessionGetsATicketItCanRedeemOnceForItselfTheProviderAndTheBrowser() {
		var user = externalSignIn.signIn(profile("google", "g-lt1", "lt1@example.com"));
		var session = sessions.start(user, null, false);

		var result = ticket(accessTokens.issueFor(user, session.sessionId()), "github").expectStatus().isOk()
			.expectBody(String.class).returnResult();

		var ticket = JsonPath.<String>read(result.getResponseBody(), "$.ticket");
		assertThat(ticket).hasSizeGreaterThan(30);
		var binder = binderOf(result.getResponseHeaders().getFirst("Set-Cookie"));
		var redeemed = tickets.redeem(ticket, "github", binder).orElseThrow();
		assertThat(redeemed.userId()).isEqualTo(user.getId());
		assertThat(redeemed.sessionId()).isEqualTo(session.sessionId());
		assertThat(tickets.redeem(ticket, "github", binder)).as("works once").isEmpty();
	}

	@Test
	void theBinderTravelsInAnHttpOnlyCookieOnlyTheOAuthHandshakeSees() {
		var user = externalSignIn.signIn(profile("google", "g-lt1b", "lt1b@example.com"));

		var cookie = ticket(tokenFor(user), "github").expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseHeaders().getFirst("Set-Cookie");

		assertThat(cookie).startsWith("link_binder=").contains("HttpOnly").contains("Secure").contains("SameSite=Lax")
			.contains("Path=/api/auth/oauth2").contains("Max-Age=120");
	}

	@Test
	void aTicketWorksOnlyForTheProviderItWasAskedFor() {
		var user = externalSignIn.signIn(profile("google", "g-lt1c", "lt1c@example.com"));
		var result = ticket(tokenFor(user), "github").expectStatus().isOk().expectBody(String.class).returnResult();
		var ticket = JsonPath.<String>read(result.getResponseBody(), "$.ticket");
		var binder = binderOf(result.getResponseHeaders().getFirst("Set-Cookie"));

		assertThat(tickets.redeem(ticket, "google", binder)).isEmpty();
		assertThat(tickets.redeem(ticket, "github", binder)).as("a wrong try burns it").isEmpty();
	}

	@Test
	void aTicketWorksOnlyInTheBrowserThatAskedForIt() {
		var user = externalSignIn.signIn(profile("google", "g-lt1d", "lt1d@example.com"));
		var body = ticket(tokenFor(user), "github").expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();
		var ticket = JsonPath.<String>read(body, "$.ticket");

		// Somebody else's browser follows a link carrying the ticket: it has no cookie, or another one.
		assertThat(tickets.redeem(ticket, "github", null)).isEmpty();

		var again = JsonPath.<String>read(
				ticket(tokenFor(user), "github").expectStatus().isOk().expectBody(String.class).returnResult()
					.getResponseBody(),
				"$.ticket");
		assertThat(tickets.redeem(again, "github", "someone-elses-binder")).isEmpty();
	}

	@Test
	void aTicketLastsTwoMinutes() {
		var user = externalSignIn.signIn(profile("google", "g-lt2", "lt2@example.com"));
		var result = ticket(tokenFor(user), "github").expectStatus().isOk().expectBody(String.class).returnResult();
		var ticket = JsonPath.<String>read(result.getResponseBody(), "$.ticket");
		var binder = binderOf(result.getResponseHeaders().getFirst("Set-Cookie"));

		clock.advance(Duration.ofMinutes(2).plusSeconds(1));

		assertThat(tickets.redeem(ticket, "github", binder)).isEmpty();
	}

	@Test
	void aSessionStartedMoreThanTenMinutesAgoMustSignInAgain() {
		var user = externalSignIn.signIn(profile("google", "g-lt3", "lt3@example.com"));
		var token = tokenFor(user);

		clock.advance(Duration.ofMinutes(11));

		ticket(token, "github").expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("reauth_required");
	}

	@Test
	void anOldSessionIsNotAskedToSignInAgainForSomethingThatWouldFailAnyway() {
		var user = externalSignIn.signIn(profile("google", "g-lt3b", "lt3b@example.com"));
		var token = tokenFor(user);

		clock.advance(Duration.ofMinutes(11));

		ticket(token, "google").expectStatus().isEqualTo(409);
		ticket(token, "myspace").expectStatus().isNotFound();
	}

	@Test
	void aProviderThatIsAlreadyLinkedIs409() {
		var user = externalSignIn.signIn(profile("google", "g-lt4", "lt4@example.com"));

		ticket(tokenFor(user), "google").expectStatus().isEqualTo(409)
			.expectBody().jsonPath("$.code").isEqualTo("already_connected");
	}

	@Test
	void anUnknownProviderIs404() {
		var user = externalSignIn.signIn(profile("google", "g-lt5", "lt5@example.com"));

		ticket(tokenFor(user), "myspace").expectStatus().isNotFound();
	}

	@Test
	void anEndedSessionIs401() {
		var user = externalSignIn.signIn(profile("google", "g-lt6", "lt6@example.com"));
		var token = tokenFor(user);
		sessions.endAll(user);

		ticket(token, "github").expectStatus().isUnauthorized();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Noyce", "email", "noyce-lt@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		ticket(JsonPath.read(response, "$.accessToken"), "github").expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void needsASignedInUser() {
		client.post().uri("/api/users/me/linked-identities/github/link-ticket").exchange().expectStatus()
			.isUnauthorized();
	}

	private static String binderOf(String setCookie) {
		return setCookie.substring("link_binder=".length(), setCookie.indexOf(';'));
	}

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user, null, false).sessionId());
	}

	private RestTestClient.ResponseSpec ticket(String accessToken, String provider) {
		return client.post().uri("/api/users/me/linked-identities/" + provider + "/link-ticket")
			.header("Authorization", "Bearer " + accessToken)
			.exchange();
	}

	private static ExternalProfile profile(String provider, String id, String email) {
		return new ExternalProfile(provider, id, email, true, "Someone", null, email);
	}

}
