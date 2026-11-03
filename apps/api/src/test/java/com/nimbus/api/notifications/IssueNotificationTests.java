package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.issues.IssueCreated;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Publishes hand-made {@code IssueCreated} events, as {@code issues} would, and checks what the module does. */
@Import({ TestcontainersConfiguration.class, RecordingMailer.class })
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.ALL_DEPENDENCIES,
	webEnvironment = org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class IssueNotificationTests {

	@Autowired RestTestClient client;
	@Autowired org.springframework.jdbc.core.simple.JdbcClient jdbc;

	record Person(String email, String token, UUID id) {
	}

	Person person(String name) {
		var email = name.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		var registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registered, "$.accessToken");
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(token))
			.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
		return new Person(email, token, UUID.fromString(JsonPath.read(registered, "$.user.id")));
	}

	IssueCreated created(String key, String title, Person actor, Person assignee) {
		return new IssueCreated(UUID.randomUUID(), key, actor.id(), title, actor.id(), assignee == null ? null : assignee.id());
	}

	long count(Person p) {
		return jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :user").param("user", p.id())
			.query(Long.class).single();
	}

	@Test
	void theAssigneeGetsOneNotificationWithASnapshotAndAnEmailThatLinksToTheIssue(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		var event = created("NIM-12", "Fix the login", maya, sam);
		scenario.publish(event).andWaitForStateChange(() -> RecordingMailer.sentTo(sam.email()).stream()
			.filter(m -> m.subject().equals("Maya assigned you NIM-12")).toList(), mails -> mails.size() == 1)
			.andVerify(mails -> {
				var mail = mails.getFirst();
				assertThat(mail.text()).contains("Maya assigned you NIM-12 · Fix the login")
					.contains("Open NIM-12: http").contains("/issues/NIM-12")
					.contains("You get this because you reported or are assigned to this issue");
				assertThat(mail.html()).contains("Open NIM-12").contains("/issues/NIM-12");
			});
		// A redelivered event is still one Notification.
		scenario.publish(event);
		var other = person("Other");
		scenario.publish(created("NIM-13", "Sentinel", maya, other)).andWaitForStateChange(() -> count(other), n -> n == 1);
		assertThat(count(sam)).isEqualTo(1);
		client.patch().uri("/api/users/me").headers(h -> h.setBearerAuth(maya.token()))
			.body(Map.of("displayName", "Maya Renamed")).exchange().expectStatus().isOk();
		client.get().uri("/api/notifications").headers(h -> h.setBearerAuth(sam.token())).exchange().expectStatus().isOk()
			.expectBody().jsonPath("$.items.length()").isEqualTo(1)
			.jsonPath("$.items[0].type").isEqualTo("ISSUE_ASSIGNED")
			.jsonPath("$.items[0].snapshot.actorName").isEqualTo("Maya")
			.jsonPath("$.items[0].snapshot.issueKey").isEqualTo("NIM-12")
			.jsonPath("$.items[0].snapshot.title").isEqualTo("Fix the login")
			.jsonPath("$.items[0].link").isEqualTo("/issues/NIM-12");
	}

	@Test
	void assigningYourselfOrNobodyNotifiesNobody(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		scenario.publish(created("NIM-20", "Mine", maya, maya));
		scenario.publish(created("NIM-21", "Nobody's", maya, null));
		scenario.publish(created("NIM-22", "Sentinel", maya, sam)).andWaitForStateChange(() -> count(sam), n -> n == 1)
			.andVerify(n -> assertThat(count(maya)).isZero());
		assertThat(RecordingMailer.sentTo(maya.email()).stream().filter(m -> m.subject().contains("assigned you"))).isEmpty();
	}

	@Test
	void theEmailSwitchOnlyDecidesTheEmail(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		var other = person("Other");
		client.put().uri("/api/users/me/notification-settings/ISSUE_ASSIGNED").headers(h -> h.setBearerAuth(sam.token()))
			.body(Map.of("email", false)).exchange().expectStatus().isNoContent();
		scenario.publish(created("NIM-30", "Quiet", maya, sam)).andWaitForStateChange(() -> count(sam), n -> n == 1);
		// The handler of the first event has committed, so a later event's email shows the earlier one was not sent.
		scenario.publish(created("NIM-31", "Sentinel", maya, other)).andWaitForStateChange(
			() -> RecordingMailer.sentTo(other.email()).stream().filter(m -> m.subject().contains("assigned you")).toList(),
			mails -> mails.size() == 1).andVerify(mails -> {
				assertThat(RecordingMailer.sentTo(sam.email()).stream().filter(m -> m.subject().contains("assigned you")))
					.isEmpty();
			});
	}
}
