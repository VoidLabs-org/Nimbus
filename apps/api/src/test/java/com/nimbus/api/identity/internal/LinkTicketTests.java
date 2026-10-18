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
	void aFreshSessionGetsATicketItCanRedeemOnceForItself() {
		var user = externalSignIn.signIn(profile("google", "g-lt1", "lt1@example.com"));
		var session = sessions.start(user, null);

		var body = ticket(accessTokens.issueFor(user, session.sessionId()), "github").expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();

		var ticket = JsonPath.<String>read(body, "$.ticket");
		assertThat(ticket).hasSizeGreaterThan(30);
		var redeemed = tickets.redeem(ticket).orElseThrow();
		assertThat(redeemed.userId()).isEqualTo(user.getId());
		assertThat(redeemed.sessionId()).isEqualTo(session.sessionId());
		assertThat(tickets.redeem(ticket)).as("works once").isEmpty();
	}

	@Test
	void aTicketLastsTwoMinutes() {
		var user = externalSignIn.signIn(profile("google", "g-lt2", "lt2@example.com"));
		var token = tokenFor(user);
		var ticket = JsonPath.<String>read(
				ticket(token, "github").expectStatus().isOk().expectBody(String.class).returnResult()
					.getResponseBody(),
				"$.ticket");

		clock.advance(Duration.ofMinutes(2).plusSeconds(1));

		assertThat(tickets.redeem(ticket)).isEmpty();
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
	void aProviderThatIsAlreadyLinkedIs409() {
		var user = externalSignIn.signIn(profile("google", "g-lt4", "lt4@example.com"));

		ticket(tokenFor(user), "google").expectStatus().isEqualTo(409);
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

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user, null).sessionId());
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
