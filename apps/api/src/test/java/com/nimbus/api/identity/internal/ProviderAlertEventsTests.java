package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.LinkedIdentityConnected;
import com.nimbus.api.identity.LinkedIdentityDisconnected;
import com.nimbus.api.identity.SecurityEvents;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Connecting and disconnecting a provider tells the rest of Nimbus through events. Run on identity (with storage,
 * which it uses for Profile pictures) and without notifications, so any email seen here was sent by identity itself,
 * which must no longer happen: notifications owns those emails.
 */
@Import({ TestcontainersConfiguration.class, RecordingMailer.class, SecurityEvents.class })
@ApplicationModuleTest(extraIncludes = "storage", webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProviderAlertEventsTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	SecurityEvents events;

	@Test
	void connectingPublishesLinkedIdentityConnectedOnceAndIdentitySendsNoEmail() {
		var user = verifiedUser("pae-con@example.com");
		var session = sessions.start(user, null, false);
		var profile = new ExternalProfile("github", "gh-pae-1", "pae-con.work@example.com", true, "Con", null, "con-hub");

		assertThat(externalSignIn.connect(user.getId(), session.sessionId(), profile)).isTrue();
		// The same account again changes nothing and says nothing.
		assertThat(externalSignIn.connect(user.getId(), session.sessionId(), profile)).isFalse();

		assertThat(events.of(LinkedIdentityConnected.class, user.getId())).singleElement().satisfies(event -> {
			assertThat(event.provider()).isEqualTo("github");
			assertThat(event.accountName()).isEqualTo("con-hub");
			assertThat(event.at()).isNotNull();
		});
		assertThat(RecordingMailer.sentTo("pae-con@example.com")).isEmpty();
	}

	@Test
	void disconnectingPublishesLinkedIdentityDisconnectedOnceAndIdentitySendsNoEmail() {
		var user = verifiedUser("pae-dis@example.com");
		var session = sessions.start(user, null, false);
		externalSignIn.connect(user.getId(), session.sessionId(),
				new ExternalProfile("github", "gh-pae-2", "pae-dis@example.com", true, "Dis", null, "dis-hub"));
		var token = accessTokens.issueFor(user, session.sessionId());

		disconnect(token, "github").expectStatus().isNoContent();
		// Nothing was connected any more, so nothing changes and nothing is said.
		disconnect(token, "github").expectStatus().isNoContent();

		assertThat(events.of(LinkedIdentityDisconnected.class, user.getId())).singleElement().satisfies(event -> {
			assertThat(event.provider()).isEqualTo("github");
			assertThat(event.at()).isNotNull();
		});
		assertThat(RecordingMailer.sentTo("pae-dis@example.com")).isEmpty();
	}

	/** A User created by their first Google sign-in: verified, with no password and no verification email. */
	private User verifiedUser(String email) {
		return externalSignIn.signIn(new ExternalProfile("google", "g-" + email, email, true, "Someone", null, email));
	}

	private RestTestClient.ResponseSpec disconnect(String accessToken, String provider) {
		return client.delete().uri("/api/users/me/linked-identities/" + provider)
			.header("Authorization", "Bearer " + accessToken)
			.exchange();
	}

}
