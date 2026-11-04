package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.issues.IssueChanged;
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

	static IssueChanged.Change change(String field, String before, String after) {
		return new IssueChanged.Change(field, before, after);
	}

	IssueChanged changed(String key, String title, Person actor, Person reporter, Person assignee,
			IssueChanged.Change... changes) {
		return new IssueChanged(UUID.randomUUID(), key, actor.id(), title, reporter.id(),
			assignee == null ? null : assignee.id(), List.of(changes), Instant.now());
	}

	List<Map<String, Object>> notifications(Person p, String type) {
		return jdbc.sql("SELECT type, snapshot::text AS snapshot FROM notifications WHERE user_id = :user AND type = :type")
			.param("user", p.id()).param("type", type).query().listOfRows();
	}

	/** Waits until a sentinel Assignee is told, which happens after the events published before it are handled. */
	void settle(Scenario scenario, Person actor) {
		var sentinel = person("Sentinel");
		scenario.publish(created("NIM-S" + UUID.randomUUID().toString().substring(0, 6), "Sentinel", actor, sentinel))
			.andWaitForStateChange(() -> count(sentinel), n -> n == 1);
	}

	@Test
	void reassigningTellsTheOldAssigneeTheNewOneAndOnlyListsTheChangeForTheReporter(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		var alex = person("Alex");
		var riley = person("Riley");
		var event = changed("NIM-40", "Reassign me", maya, riley, alex,
			change("assignee", sam.id().toString(), alex.id().toString()));
		scenario.publish(event).andWaitForStateChange(() -> count(alex), n -> n == 1);
		// A redelivered event is still one Notification each.
		scenario.publish(event);
		settle(scenario, maya);
		assertThat(notifications(sam, "ISSUE_UNASSIGNED")).hasSize(1);
		assertThat(notifications(alex, "ISSUE_ASSIGNED")).hasSize(1);
		var edited = notifications(riley, "ISSUE_EDITED");
		assertThat(edited).hasSize(1);
		assertThat((String) edited.getFirst().get("snapshot")).contains("changed the Assignee").contains("NIM-40")
			.contains("Reassign me");
		assertThat(count(sam)).isEqualTo(1);
		assertThat(count(alex)).isEqualTo(1);
		assertThat(count(riley)).isEqualTo(1);
		assertThat(count(maya)).isZero();
		// The old Assignee's email follows their switch (on by default); the Reporter's Edited email is off by default.
		assertThat(RecordingMailer.sentTo(sam.email()).stream()
			.filter(m -> m.subject().equals("Maya unassigned you from NIM-40"))).hasSize(1);
		assertThat(RecordingMailer.sentTo(alex.email()).stream()
			.filter(m -> m.subject().equals("Maya assigned you NIM-40"))).hasSize(1);
		assertThat(RecordingMailer.sentTo(riley.email()).stream().filter(m -> m.subject().contains("NIM-40"))).isEmpty();
	}

	@Test
	void clearingTheAssigneeTellsTheOldAssigneeAndTheReporter(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		var riley = person("Riley");
		scenario.publish(changed("NIM-41", "Clear me", maya, riley, null, change("assignee", sam.id().toString(), null)))
			.andWaitForStateChange(() -> count(sam), n -> n == 1);
		settle(scenario, maya);
		assertThat(notifications(sam, "ISSUE_UNASSIGNED")).hasSize(1);
		assertThat(notifications(riley, "ISSUE_EDITED")).hasSize(1);
		assertThat(count(maya)).isZero();
	}

	@Test
	void severalEditsInOneSaveGiveEachRecipientOneNotificationNamingEveryField(Scenario scenario) {
		var maya = person("Maya");
		var riley = person("Riley");
		var sam = person("Sam");
		scenario.publish(changed("NIM-42", "New title", maya, riley, sam, change("title", "Old", "New title"),
			change("description", null, null), change("priority", "Low", "High"), change("type", "Story", "Bug")))
			.andWaitForStateChange(() -> count(sam), n -> n == 1);
		settle(scenario, maya);
		for (var recipient : List.of(riley, sam)) {
			var edited = notifications(recipient, "ISSUE_EDITED");
			assertThat(edited).hasSize(1);
			assertThat((String) edited.getFirst().get("snapshot")).contains("edited title, description and priority")
				.doesNotContain("Old\"").doesNotContain("High");
			assertThat(count(recipient)).isEqualTo(1);
		}
		assertThat(count(maya)).isZero();
	}

	@Test
	void aReporterWhoIsAlsoTheAssigneeGetsOneNotificationAndNobodyHearsAboutTheirOwnChange(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		scenario.publish(changed("NIM-43", "Mine", maya, sam, sam, change("priority", "Low", "High")))
			.andWaitForStateChange(() -> count(sam), n -> n == 1);
		// Maya is the Reporter and the Assignee and edits it herself: nobody is told.
		scenario.publish(changed("NIM-44", "Hers", maya, maya, maya, change("title", "A", "Hers")));
		settle(scenario, maya);
		assertThat(count(sam)).isEqualTo(1);
		assertThat(count(maya)).isZero();
	}

	static IssueChanged.Change move(String from, String fromCategory, String to, String toCategory) {
		return new IssueChanged.Change("status", from, to, fromCategory, toCategory);
	}

	@Test
	void aStatusMoveTellsTheReporterAndTheAssigneeButNotTheMover(Scenario scenario) {
		var maya = person("Maya");
		var riley = person("Riley");
		var sam = person("Sam");
		var event = changed("NIM-50", "Ship it", maya, riley, sam,
			move("In progress", "IN_PROGRESS", "In review", "IN_PROGRESS"));
		scenario.publish(event).andWaitForStateChange(() -> RecordingMailer.sentTo(sam.email()).stream()
			.filter(m -> m.subject().equals("Maya moved NIM-50 In progress → In review")).toList(), mails -> mails.size() == 1)
			.andVerify(mails -> assertThat(mails.getFirst().text())
				.contains("Maya moved NIM-50 In progress → In review · Ship it").contains("/issues/NIM-50"));
		// A redelivered event is still one Notification each.
		scenario.publish(event);
		settle(scenario, maya);
		for (var recipient : List.of(riley, sam)) {
			var moved = notifications(recipient, "ISSUE_STATUS_CHANGED");
			assertThat(moved).hasSize(1);
			assertThat((String) moved.getFirst().get("snapshot")).contains("\"fromStatus\": \"In progress\"")
				.contains("\"toStatus\": \"In review\"").contains("\"fromCategory\": \"IN_PROGRESS\"")
				.contains("\"toCategory\": \"IN_PROGRESS\"");
			assertThat(count(recipient)).isEqualTo(1);
		}
		assertThat(count(maya)).isZero();
		assertThat(RecordingMailer.sentTo(riley.email()).stream()
			.filter(m -> m.subject().equals("Maya moved NIM-50 In progress → In review"))).hasSize(1);
	}

	@Test
	void aReporterWhoIsTheAssigneeGetsOneAndNobodyHearsAboutTheirOwnMove(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		scenario.publish(changed("NIM-51", "Mine", maya, sam, sam, move("To do", "TODO", "Done", "DONE")))
			.andWaitForStateChange(() -> count(sam), n -> n == 1);
		scenario.publish(changed("NIM-52", "Hers", maya, maya, maya, move("To do", "TODO", "Done", "DONE")));
		settle(scenario, maya);
		assertThat(count(sam)).isEqualTo(1);
		assertThat(count(maya)).isZero();
	}

	@Test
	void aSaveThatMovesTheStatusAndEditsGivesEachRecipientOneNotificationShowingTheMove(Scenario scenario) {
		var maya = person("Maya");
		var riley = person("Riley");
		var sam = person("Sam");
		scenario.publish(changed("NIM-53", "New title", maya, riley, sam, change("title", "Old", "New title"),
			move("To do", "TODO", "Done", "DONE"))).andWaitForStateChange(() -> count(sam), n -> n == 1);
		settle(scenario, maya);
		for (var recipient : List.of(riley, sam)) {
			assertThat(notifications(recipient, "ISSUE_STATUS_CHANGED")).hasSize(1);
			assertThat(notifications(recipient, "ISSUE_EDITED")).isEmpty();
			assertThat(count(recipient)).isEqualTo(1);
		}
	}

	@Test
	void theStatusChangedEmailFollowsTheSwitch(Scenario scenario) {
		var maya = person("Maya");
		var sam = person("Sam");
		var other = person("Other");
		client.put().uri("/api/users/me/notification-settings/ISSUE_STATUS_CHANGED")
			.headers(h -> h.setBearerAuth(sam.token())).body(Map.of("email", false)).exchange().expectStatus().isNoContent();
		scenario.publish(changed("NIM-54", "Quiet", maya, maya, sam, move("To do", "TODO", "Done", "DONE")))
			.andWaitForStateChange(() -> count(sam), n -> n == 1);
		scenario.publish(changed("NIM-55", "Loud", maya, maya, other, move("To do", "TODO", "Done", "DONE")))
			.andWaitForStateChange(() -> RecordingMailer.sentTo(other.email()).stream()
				.filter(m -> m.subject().contains("NIM-55")).toList(), mails -> mails.size() == 1)
			.andVerify(mails -> assertThat(RecordingMailer.sentTo(sam.email()).stream()
				.filter(m -> m.subject().contains("moved NIM-54"))).isEmpty());
	}

	@Test
	void typeOnlyChangesAreNotEditsAndTheEditedEmailFollowsTheSwitch(Scenario scenario) {
		var maya = person("Maya");
		var riley = person("Riley");
		var sam = person("Sam");
		scenario.publish(changed("NIM-45", "Typed", maya, riley, sam, change("type", "Story", "Bug")));
		client.put().uri("/api/users/me/notification-settings/ISSUE_EDITED").headers(h -> h.setBearerAuth(sam.token()))
			.body(Map.of("email", true)).exchange().expectStatus().isNoContent();
		scenario.publish(changed("NIM-46", "Edited", maya, riley, sam, change("title", "A", "Edited")))
			.andWaitForStateChange(() -> RecordingMailer.sentTo(sam.email()).stream()
				.filter(m -> m.subject().equals("Maya edited title on NIM-46")).toList(), mails -> mails.size() == 1)
			.andVerify(mails -> assertThat(mails.getFirst().text()).contains("Maya edited title on NIM-46 · Edited"));
		assertThat(count(sam)).isEqualTo(1);
		assertThat(count(riley)).isEqualTo(1);
		assertThat(RecordingMailer.sentTo(riley.email()).stream().filter(m -> m.subject().contains("NIM-46"))).isEmpty();
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
