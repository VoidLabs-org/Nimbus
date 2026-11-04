package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.issues.IssueChanged;
import com.nimbus.api.issues.IssueCreated;
import com.nimbus.api.mail.Mail;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Changes to one Issue for one User are emailed together, 3 minutes after the last change and never later than 10
 * minutes after the first. The job runs every second here, and time only moves when a test moves it.
 */
@Import({ TestcontainersConfiguration.class, RecordingMailer.class, MovableClock.Configuration.class })
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.ALL_DEPENDENCIES,
	webEnvironment = org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@org.springframework.test.context.TestPropertySource(properties = "nimbus.notifications.email-cron=* * * * * *")
class GroupedIssueEmailTests {

	@Autowired RestTestClient client;
	@Autowired JdbcClient jdbc;
	@Autowired MovableClock clock;

	record Person(String email, String token, UUID id) {
	}

	UUID project;

	Person person(String name) {
		var email = name.toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		var registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registered, "$.accessToken");
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(token))
			.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
		var person = new Person(email, token, UUID.fromString(JsonPath.read(registered, "$.user.id")));
		if (project == null) {
			project = UUID.randomUUID();
			jdbc.sql("INSERT INTO projects (id, key, name, created_at) VALUES (:id, :key, 'Grouping', now())")
				.param("id", project).param("key", "G" + project.toString().replace("-", "").substring(0, 9).toUpperCase())
				.update();
		}
		jdbc.sql("INSERT INTO project_members (project_id, user_id, added_at) VALUES (:project, :user, now())")
			.param("project", project).param("user", person.id()).update();
		return person;
	}

	long count(Person p) {
		return jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :user").param("user", p.id())
			.query(Long.class).single();
	}

	/** The actor moves the Issue, which tells the Assignee. */
	void move(Scenario scenario, Person actor, Person assignee, String key, String to, long expected) {
		var event = new IssueChanged(project, key, actor.id(), "Ship it", actor.id(), assignee.id(),
			List.of(new IssueChanged.Change("status", "To do", to, new IssueChanged.Change.Categories("TODO", "IN_PROGRESS"))),
			clock.instant());
		scenario.publish(event).andWaitForStateChange(() -> count(assignee), n -> n == expected);
	}

	List<Mail> about(Person p, String key) {
		return RecordingMailer.sentTo(p.email()).stream().filter(m -> m.subject().contains(key)).toList();
	}

	@Test
	void threeChangesInFourMinutesAreOneEmailListingEachOfThem(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		move(scenario, maya, sam, "NIM-1", "A", 1);
		clock.advance(Duration.ofMinutes(2));
		move(scenario, maya, sam, "NIM-1", "B", 2);
		clock.advance(Duration.ofMinutes(2));
		move(scenario, maya, sam, "NIM-1", "C", 3);
		await().during(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(about(sam, "NIM-1")).isEmpty());
		clock.advance(Duration.ofMinutes(3));
		await().untilAsserted(() -> assertThat(about(sam, "NIM-1")).hasSize(1));
		var mail = about(sam, "NIM-1").getFirst();
		assertThat(mail.subject()).isEqualTo("3 updates on NIM-1");
		assertThat(mail.text()).contains("Maya moved it To do → A").contains("Maya moved it To do → B")
			.contains("Maya moved it To do → C").contains("/issues/NIM-1");
		assertThat(mail.html()).contains("3 updates").contains("Open NIM-1");
		// Nothing more is sent for them later.
		clock.advance(Duration.ofMinutes(30));
		await().during(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(about(sam, "NIM-1")).hasSize(1));
	}

	@Test
	void aChangeEveryTwoMinutesIsStillSentTenMinutesAfterTheFirst(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		for (int i = 1; i <= 5; i++) {
			move(scenario, maya, sam, "NIM-2", "S" + i, i);
			clock.advance(Duration.ofMinutes(2));
			if (i < 5) {
				await().during(Duration.ofSeconds(2)).untilAsserted(() -> assertThat(about(sam, "NIM-2")).isEmpty());
			}
		}
		// Ten minutes have passed since the first change; the group is due although a change came 2 minutes ago.
		await().untilAsserted(() -> assertThat(about(sam, "NIM-2")).hasSize(1));
		assertThat(about(sam, "NIM-2").getFirst().subject()).isEqualTo("5 updates on NIM-2");
	}

	@Test
	void aSingleChangeKeepsItsOwnSubjectAndAssignedIsSentRightAway(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		scenario.publish(new IssueCreated(project, "NIM-3", maya.id(), "Fresh", maya.id(), sam.id()))
			.andWaitForStateChange(() -> about(sam, "NIM-3"), mails -> mails.size() == 1)
			.andVerify(mails -> assertThat(mails.getFirst().subject()).isEqualTo("Maya assigned you NIM-3"));
		move(scenario, maya, sam, "NIM-4", "Done", 2);
		clock.advance(Duration.ofMinutes(3));
		await().untilAsserted(() -> assertThat(about(sam, "NIM-4")).hasSize(1));
		assertThat(about(sam, "NIM-4").getFirst().subject()).isEqualTo("Maya moved NIM-4 To do → Done");
	}

	@Test
	void aNotificationThatWasReadInTheAppIsStillEmailed(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		move(scenario, maya, sam, "NIM-5", "Done", 1);
		client.post().uri("/api/notifications/read-all").headers(h -> h.setBearerAuth(sam.token())).exchange()
			.expectStatus().isNoContent();
		clock.advance(Duration.ofMinutes(3));
		await().untilAsserted(() -> assertThat(about(sam, "NIM-5")).hasSize(1));
	}

	@Test
	void aSwitchTurnedOffBeforeTheNotificationMeansNoEmail(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		client.put().uri("/api/users/me/notification-settings/ISSUE_STATUS_CHANGED")
			.headers(h -> h.setBearerAuth(sam.token())).body(Map.of("email", false)).exchange().expectStatus()
			.isNoContent();
		move(scenario, maya, sam, "NIM-6", "Done", 1);
		clock.advance(Duration.ofMinutes(11));
		await().during(Duration.ofSeconds(3)).untilAsserted(() -> assertThat(about(sam, "NIM-6")).isEmpty());
	}
}
