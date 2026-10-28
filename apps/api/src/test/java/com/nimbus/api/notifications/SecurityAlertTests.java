package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.LinkedIdentityConnected;
import com.nimbus.api.identity.LinkedIdentityDisconnected;
import com.nimbus.api.identity.OtherSessionsSignedOut;
import com.nimbus.api.identity.PasswordChanged;
import com.nimbus.api.mail.Mail;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The Security alerts other than a new sign-in: each event becomes one Notification in the panel and exactly one
 * immediate email, even when it is delivered twice and even though the User did it themselves.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SecurityAlertTests {

	private static final Instant AT = Instant.parse("2026-10-19T08:00:00Z");

	@Autowired RestTestClient client;
	@Autowired ApplicationEventPublisher events;
	@Autowired TransactionTemplate transaction;

	@Test
	void aPasswordChangeIsOneAlertAndOneEmail() {
		var user = verifiedUser("sa-change@example.com");

		publishTwice(new PasswordChanged(user.id(), AT, false));

		var item = onlyItem(user, "PASSWORD_CHANGED");
		assertThat(JsonPath.<String>read(item, "$.items[0].snapshot.title")).isEqualTo("Password changed");
		assertThat(JsonPath.<String>read(item, "$.items[0].snapshot.detail")).isEqualTo("If this wasn't you, reset it now.");
		assertThat(JsonPath.<String>read(item, "$.items[0].link")).isEqualTo("/settings/security");
		assertThat(JsonPath.<Boolean>read(item, "$.items[0].read")).isFalse();
		var mail = onlyMail(user, "Your Nimbus password was changed");
		assertThat(mail.text()).contains("19 Oct 2026", "http://localhost:3000/settings/security", "always sent");
		assertThat(mail.html()).contains("Review security");
	}

	@Test
	void aPasswordResetSaysItWasAReset() {
		var user = verifiedUser("sa-reset@example.com");

		publishTwice(new PasswordChanged(user.id(), AT, true));

		assertThat(JsonPath.<String>read(onlyItem(user, "PASSWORD_CHANGED"), "$.items[0].snapshot.title"))
			.isEqualTo("Password reset");
		assertThat(onlyMail(user, "Your Nimbus password was reset").text()).contains("reset");
	}

	@Test
	void connectingAProviderIsOneAlertAndOneEmailNamingTheAccount() {
		var user = verifiedUser("sa-connect@example.com");

		publishTwice(new LinkedIdentityConnected(user.id(), "google", "sa-connect.work@example.com", AT));

		var item = onlyItem(user, "LINKED_IDENTITY_CONNECTED");
		assertThat(JsonPath.<String>read(item, "$.items[0].snapshot.title")).isEqualTo("Google connected");
		assertThat(JsonPath.<String>read(item, "$.items[0].snapshot.detail")).contains("sa-connect.work@example.com");
		var mail = onlyMail(user, "Google was connected to your Nimbus account");
		assertThat(mail.html()).contains("Google connected", "Review sign-in methods");
		assertThat(mail.text()).contains("/settings/security");
	}

	@Test
	void disconnectingAProviderIsOneAlertAndOneEmail() {
		var user = verifiedUser("sa-disconnect@example.com");

		publishTwice(new LinkedIdentityDisconnected(user.id(), "github", AT));

		assertThat(JsonPath.<String>read(onlyItem(user, "LINKED_IDENTITY_DISCONNECTED"), "$.items[0].snapshot.title"))
			.isEqualTo("GitHub disconnected");
		var mail = onlyMail(user, "GitHub was disconnected from your Nimbus account");
		assertThat(mail.html()).contains("GitHub disconnected", "Review sign-in methods");
	}

	@Test
	void signingOutOtherDevicesIsOneAlertAndOneEmail() {
		var user = verifiedUser("sa-others@example.com");

		publishTwice(new OtherSessionsSignedOut(user.id(), AT));

		var item = onlyItem(user, "OTHER_SESSIONS_SIGNED_OUT");
		assertThat(JsonPath.<String>read(item, "$.items[0].snapshot.title")).isEqualTo("Signed out of other devices");
		assertThat(JsonPath.<String>read(item, "$.items[0].snapshot.detail")).contains("If this wasn't you");
		assertThat(onlyMail(user, "You signed out of your other devices").text()).contains("19 Oct 2026");
	}

	@Test
	void twoDifferentChangesAreTwoAlerts() {
		var user = verifiedUser("sa-two@example.com");

		publish(new PasswordChanged(user.id(), AT, false));
		publish(new PasswordChanged(user.id(), AT.plusSeconds(60), false));

		await().untilAsserted(() -> assertThat(JsonPath.<Integer>read(list(user), "$.items.length()")).isEqualTo(2));
	}

	@Test
	void anUnverifiedUserGetsNoAlertAndNoEmail() {
		var user = registered("sa-unverified@example.com");
		var other = verifiedUser("sa-after-unverified@example.com");

		publish(new PasswordChanged(user.id(), AT, false));
		publish(new PasswordChanged(other.id(), AT, false));

		// Once the later, verified User's alert has arrived, the earlier event has been handled too.
		await().untilAsserted(() -> assertThat(RecordingMailer.sentTo(other.email()))
			.anyMatch(mail -> mail.subject().equals("Your Nimbus password was changed")));
		assertThat(RecordingMailer.sentTo(user.email()))
			.noneMatch(mail -> mail.subject().equals("Your Nimbus password was changed"));
	}

	private void publishTwice(Object event) {
		publish(event);
		publish(event);
	}

	private void publish(Object event) {
		transaction.executeWithoutResult(status -> events.publishEvent(event));
	}

	/** The User's list as JSON once it holds one Notification, of this type; fails when there are more. */
	private String onlyItem(TestUser user, String type) {
		await().untilAsserted(() -> assertThat(list(user)).contains(type));
		var body = list(user);
		assertThat(JsonPath.<Integer>read(body, "$.items.length()")).isEqualTo(1);
		assertThat(JsonPath.<String>read(body, "$.items[0].type")).isEqualTo(type);
		return body;
	}

	private Mail onlyMail(TestUser user, String subject) {
		await().untilAsserted(() -> assertThat(mailsWith(user, subject)).isNotEmpty());
		// A second send, if there were one, would follow the first within moments.
		await().during(Duration.ofMillis(300)).untilAsserted(() -> assertThat(mailsWith(user, subject)).hasSize(1));
		return mailsWith(user, subject).getFirst();
	}

	private static List<Mail> mailsWith(TestUser user, String subject) {
		return RecordingMailer.sentTo(user.email()).stream().filter(mail -> mail.subject().equals(subject)).toList();
	}

	private TestUser registered(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ada", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return new TestUser(UUID.fromString(JsonPath.read(response, "$.user.id")), email,
			JsonPath.read(response, "$.accessToken"));
	}

	private TestUser verifiedUser(String email) {
		var user = registered(email);
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(user.token()))
			.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
		return user;
	}

	private String list(TestUser user) {
		return client.get().uri("/api/notifications").headers(h -> h.setBearerAuth(user.token()))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
	}

	private record TestUser(UUID id, String email, String token) {
	}

}
