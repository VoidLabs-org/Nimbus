package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The Connected accounts card's list. Providers are not faked over HTTP: the profile is what the provider would
 * have said, handed to the entry point the OAuth success handler uses.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class LinkedIdentityListTests {

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
	void listsGoogleBeforeGithubWithTheNameEachGave() {
		// GitHub is linked first, so the order can't be the order they were linked in.
		var user = externalSignIn.signIn(profile("github", "gh-ada", "ada@example.com", "ada-codes"));
		externalSignIn.signIn(profile("google", "g-ada", "ada@example.com", "ada@example.com"));

		var body = bodyOf(list(tokenFor(user)));

		assertThat(JsonPath.<List<String>>read(body, "$[*].provider")).containsExactly("google", "github");
		assertThat(JsonPath.<List<String>>read(body, "$[*].accountName"))
			.containsExactly("ada@example.com", "ada-codes");
		assertThat(JsonPath.<String>read(body, "$[0].connectedAt")).isNotBlank();
	}

	@Test
	void anIdentityLinkedBeforeNamesWereKeptHasANullAccountName() {
		var user = externalSignIn.signIn(profile("google", "g-old", "old@example.com", "old@example.com"));
		jdbc.update("UPDATE linked_identities SET account_name = NULL WHERE user_id = ?", user.getId());

		var body = bodyOf(list(tokenFor(user)));

		assertThat(JsonPath.<Integer>read(body, "$.length()")).isEqualTo(1);
		assertThat(JsonPath.<Object>read(body, "$[0].accountName")).isNull();
		assertThat(JsonPath.<String>read(body, "$[0].provider")).isEqualTo("google");
	}

	@Test
	void aUserWithNothingLinkedGetsAnEmptyList() {
		var user = externalSignIn.signIn(profile("google", "g-none", "none@example.com", "none@example.com"));
		jdbc.update("DELETE FROM linked_identities WHERE user_id = ?", user.getId());

		assertThat(bodyOf(list(tokenFor(user)))).isEqualTo("[]");
	}

	@Test
	void showsOnlyTheSignedInUsersOwnIdentities() {
		externalSignIn.signIn(profile("google", "g-other", "other@example.com", "other@example.com"));
		var user = externalSignIn.signIn(profile("github", "gh-mine", "mine@example.com", "mine"));

		var body = bodyOf(list(tokenFor(user)));

		assertThat(JsonPath.<List<String>>read(body, "$[*].accountName")).containsExactly("mine");
		assertThat(body).doesNotContain("other@example.com").doesNotContain("providerUserId").doesNotContain("gh-mine");
	}

	@Test
	void aSignedOutBrowserCannotListEvenWhileItsAccessTokenStillWorks() {
		var user = externalSignIn.signIn(profile("google", "g-out", "out@example.com", "out@example.com"));
		var session = sessions.start(user, null);
		var token = accessTokens.issueFor(user, session.sessionId());
		sessions.endAll(user);

		list(token).expectStatus().isUnauthorized();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Noyce", "email", "noyce-linked@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		list(JsonPath.read(response, "$.accessToken")).expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void needsASignedInUser() {
		client.get().uri("/api/users/me/linked-identities").exchange().expectStatus().isUnauthorized();
	}

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user, null).sessionId());
	}

	private RestTestClient.ResponseSpec list(String accessToken) {
		return client.get().uri("/api/users/me/linked-identities")
			.header("Authorization", "Bearer " + accessToken)
			.exchange();
	}

	private static String bodyOf(RestTestClient.ResponseSpec response) {
		return response.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
	}

	private static ExternalProfile profile(String provider, String id, String email, String accountName) {
		return new ExternalProfile(provider, id, email, true, "Someone", null, accountName);
	}

}
