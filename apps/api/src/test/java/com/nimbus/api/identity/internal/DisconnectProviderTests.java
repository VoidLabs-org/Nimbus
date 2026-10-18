package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Disconnecting a provider from the Security page. Providers are not faked over HTTP: the profile is what the
 * provider would have said, handed to the entry point the OAuth success handler uses.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class DisconnectProviderTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void disconnectingRemovesTheIdentityMarksTheProviderAndMailsTheUser() {
		var user = externalSignIn.signIn(profile("google", "g-dc1", "dc1@example.com"));
		externalSignIn.signIn(profile("github", "gh-dc1", "dc1@example.com"));
		var token = tokenFor(user);

		disconnect(token, "google").expectStatus().isNoContent();

		var listed = client.get().uri("/api/users/me/linked-identities")
			.header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat(JsonPath.<List<String>>read(listed, "$[*].provider")).containsExactly("github");
		assertThat(marks(user, "google")).isEqualTo(1);
		var mails = RecordingMailer.sentTo("dc1@example.com");
		assertThat(mails).hasSize(1);
		assertThat(mails.get(0).subject()).isEqualTo("Google was disconnected from your Nimbus account");
		assertThat(mails.get(0).text()).contains("/settings/security");
		// The same "Ink header band" layout as the code emails: Nimbus logo, heading, and a button to the Security page.
		assertThat(mails.get(0).html()).contains(RecordingMailer.IMAGE_HOST + "/nimbus-icon-dark.png")
			.contains("<h1").contains("Google disconnected").contains("Review sign-in methods")
			.contains("href=\"http://localhost:3000/settings/security\"");
	}

	@Test
	void disconnectingKeepsEverySession() {
		var user = externalSignIn.signIn(profile("google", "g-dc2", "dc2@example.com"));
		externalSignIn.signIn(profile("github", "gh-dc2", "dc2@example.com"));
		var thisBrowser = sessions.start(user, null);
		var otherBrowser = sessions.start(user, null);

		disconnect(accessTokens.issueFor(user, thisBrowser.sessionId()), "github").expectStatus().isNoContent();

		assertThat(sessions.refresh(otherBrowser.value(), "client-dc2").user().getId()).isEqualTo(user.getId());
	}

	@Test
	void aProviderThatIsNotLinkedGives204AndChangesNothing() {
		var user = externalSignIn.signIn(profile("google", "g-dc3", "dc3@example.com"));

		disconnect(tokenFor(user), "github").expectStatus().isNoContent();

		assertThat(marks(user, "github")).isZero();
		assertThat(RecordingMailer.sentTo("dc3@example.com")).isEmpty();
	}

	@Test
	void anUnknownProviderIs404() {
		var user = externalSignIn.signIn(profile("google", "g-dc4", "dc4@example.com"));

		disconnect(tokenFor(user), "myspace").expectStatus().isNotFound();
	}

	@Test
	void theLastWayToSignInIs409UntilThereIsAPassword() {
		var user = externalSignIn.signIn(profile("google", "g-dc5", "dc5@example.com"));
		var token = tokenFor(user);

		disconnect(token, "google").expectStatus().isEqualTo(409)
			.expectBody().jsonPath("$.code").isEqualTo("last_sign_in_method");
		assertThat(marks(user, "google")).isZero();
		assertThat(RecordingMailer.sentTo("dc5@example.com")).isEmpty();

		client.put().uri("/api/users/me/password")
			.header("Authorization", "Bearer " + token)
			.body(Map.of("newPassword", "first password"))
			.exchange().expectStatus().isNoContent();

		disconnect(token, "google").expectStatus().isNoContent();
	}

	@Test
	void anEndedSessionIs401() {
		var user = externalSignIn.signIn(profile("google", "g-dc6", "dc6@example.com"));
		externalSignIn.signIn(profile("github", "gh-dc6", "dc6@example.com"));
		var token = tokenFor(user);
		sessions.endAll(user);

		disconnect(token, "github").expectStatus().isUnauthorized();
		assertThat(marks(user, "github")).isZero();
	}

	@Test
	void anEndedSessionIs401EvenForAnUnknownProvider() {
		var user = externalSignIn.signIn(profile("google", "g-dc8", "dc8@example.com"));
		var token = tokenFor(user);
		sessions.endAll(user);

		disconnect(token, "myspace").expectStatus().isUnauthorized();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Noyce", "email", "noyce-dc@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		disconnect(JsonPath.read(response, "$.accessToken"), "google").expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void aFailedSendDoesNotUndoTheDisconnect() {
		var user = externalSignIn.signIn(profile("google", "g-dc7", "dc7@example.com"));
		externalSignIn.signIn(profile("github", "gh-dc7", "dc7@example.com"));
		var token = tokenFor(user);

		RecordingMailer.failing(true);
		try {
			disconnect(token, "google").expectStatus().isNoContent();
		}
		finally {
			RecordingMailer.failing(false);
		}

		assertThat(marks(user, "google")).isEqualTo(1);
		assertThat(RecordingMailer.attemptedTo("dc7@example.com")).hasSize(1);
	}

	@Test
	void needsASignedInUser() {
		client.delete().uri("/api/users/me/linked-identities/google").exchange().expectStatus().isUnauthorized();
	}

	private int marks(User user, String provider) {
		return jdbc.queryForObject("SELECT count(*) FROM disconnected_providers WHERE user_id = ? AND provider = ?",
				Integer.class, user.getId(), provider);
	}

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user, null).sessionId());
	}

	private RestTestClient.ResponseSpec disconnect(String accessToken, String provider) {
		return client.delete().uri("/api/users/me/linked-identities/" + provider)
			.header("Authorization", "Bearer " + accessToken)
			.exchange();
	}

	private static ExternalProfile profile(String provider, String id, String email) {
		return new ExternalProfile(provider, id, email, true, "Someone", null, email);
	}

}
