package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class NotificationSettingsTests {

	static final String PATH = "/api/users/me/notification-settings";

	@Autowired RestTestClient client;
	@Autowired JdbcClient jdbc;

	@Test
	void everyEndpointRequiresASignedInVerifiedUser() {
		var token = token("settings-unverified@example.com", false);
		client.get().uri(PATH).exchange().expectStatus().isUnauthorized();
		client.put().uri(PATH + "/ISSUE_EDITED").body(Map.of("email", true)).exchange().expectStatus().isUnauthorized();
		client.get().uri(PATH).headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		client.put().uri(PATH + "/ISSUE_EDITED").headers(h -> h.setBearerAuth(token)).body(Map.of("email", true))
			.exchange().expectStatus().isForbidden().expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void emailIsOnForEveryIssueTypeExceptEditedUntilChanged() {
		var token = token("settings-defaults@example.com", true);
		var body = get(token);
		assertThat(JsonPath.<List<String>>read(body, "$[*].type")).containsExactly("ISSUE_ASSIGNED", "ISSUE_UNASSIGNED",
			"ISSUE_STATUS_CHANGED", "ISSUE_EDITED", "ISSUE_DELETED");
		assertThat(JsonPath.<List<Boolean>>read(body, "$[*].email")).containsExactly(true, true, true, false, true);
	}

	@Test
	void aSavedSwitchIsServedBackAndOnlyDifferencesFromTheDefaultAreStored() {
		var email = "settings-save@example.com";
		var token = token(email, true);
		var user = userId(email);
		put(token, "ISSUE_EDITED", true).expectStatus().isNoContent();
		put(token, "ISSUE_ASSIGNED", false).expectStatus().isNoContent();
		assertThat(JsonPath.<List<Boolean>>read(get(token), "$[*].email")).containsExactly(false, true, true, true, true);
		assertThat(stored(user)).isEqualTo(2);
		put(token, "ISSUE_EDITED", false).expectStatus().isNoContent();
		put(token, "ISSUE_ASSIGNED", true).expectStatus().isNoContent();
		put(token, "ISSUE_ASSIGNED", true).expectStatus().isNoContent();
		assertThat(stored(user)).isZero();
		assertThat(JsonPath.<List<Boolean>>read(get(token), "$[*].email")).containsExactly(true, true, true, false, true);
	}

	@Test
	void switchesBelongToTheirUser() {
		var one = token("settings-one@example.com", true);
		var two = token("settings-two@example.com", true);
		put(one, "ISSUE_DELETED", false).expectStatus().isNoContent();
		assertThat(JsonPath.<Boolean>read(get(one), "$[4].email")).isFalse();
		assertThat(JsonPath.<Boolean>read(get(two), "$[4].email")).isTrue();
	}

	@Test
	void securityAlertsAndUnknownTypesCannotBeSwitched() {
		var email = "settings-invalid@example.com";
		var token = token(email, true);
		for (var type : List.of("SIGNED_IN", "PASSWORD_CHANGED", "NOPE", "issue_edited")) {
			put(token, type, false).expectStatus().isBadRequest();
		}
		client.put().uri(PATH + "/ISSUE_EDITED").headers(h -> h.setBearerAuth(token)).body(Map.of())
			.exchange().expectStatus().isBadRequest();
		assertThat(stored(userId(email))).isZero();
	}

	long stored(UUID user) {
		return jdbc.sql("SELECT count(*) FROM notification_settings WHERE user_id = :u").param("u", user)
			.query(Long.class).single();
	}

	UUID userId(String email) {
		return jdbc.sql("SELECT id FROM users WHERE email = :e").param("e", email).query(UUID.class).single();
	}

	String get(String token) {
		return client.get().uri(PATH).headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
	}

	RestTestClient.ResponseSpec put(String token, String type, boolean email) {
		return client.put().uri(PATH + "/" + type).headers(h -> h.setBearerAuth(token)).body(Map.of("email", email)).exchange();
	}

	String token(String email, boolean verified) {
		var registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ada", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registered, "$.accessToken");
		if (verified) {
			client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(token))
				.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
		}
		return token;
	}
}
