package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;

import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Users who only sign in with a provider get a way back to a password. Providers are not faked over HTTP: the
 * profile is what the provider would have said, handed to the entry point the OAuth success handler uses.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SetPasswordAfterLinkingTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Registration registration;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	SignIn signIn;

	@Test
	void aGoogleOnlyUserCanSetAPasswordAndThenSignInWithIt() {
		var user = externalSignIn.signIn(profile("google", "g-ada", "ada@example.com"));
		assertThat(user.passwordHash()).isNull();
		var token = tokenFor(user);
		hasPassword(token, false);

		setPassword(token, Map.of("newPassword", "first password")).expectStatus().isNoContent();

		hasPassword(token, true);
		login("ada@example.com", "first password").expectStatus().isOk();
	}

	@Test
	void aGithubOnlyUserCanSetAPasswordAndThenSignInWithIt() {
		var user = externalSignIn.signIn(profile("github", "gh-bea", "bea@example.com"));

		setPassword(tokenFor(user), Map.of("newPassword", "first password")).expectStatus().isNoContent();

		login("bea@example.com", "first password").expectStatus().isOk();
	}

	// Nothing was compromised by adding a way in, so the User's other devices stay signed in.
	@Test
	void settingAFirstPasswordLeavesTheOtherSessionsRunning() {
		var user = externalSignIn.signIn(profile("google", "g-first", "first@example.com"));
		var thisBrowser = sessions.start(user);
		var otherBrowser = sessions.start(user);

		setPassword(accessTokens.issueFor(user, thisBrowser.sessionId()), Map.of("newPassword", "first password"))
			.expectStatus().isNoContent();

		assertThat(sessions.refresh(otherBrowser.value(), "client-first").user().getId()).isEqualTo(user.getId());
	}

	@Test
	void afterSettingOneTheUserMustGiveItToChangeIt() {
		var user = externalSignIn.signIn(profile("google", "g-cy", "cy@example.com"));
		var token = tokenFor(user);
		setPassword(token, Map.of("newPassword", "first password")).expectStatus().isNoContent();

		setPassword(token, Map.of("newPassword", "second password")).expectStatus().isBadRequest();
		setPassword(token, Map.of("currentPassword", "first password", "newPassword", "second password"))
			.expectStatus().isNoContent();

		login("cy@example.com", "second password").expectStatus().isOk();
	}

	// A provider sign-in ends the sessions of whoever registered the email first, but their access token lives on.
	@Test
	void whoeverRegisteredTheEmailFirstCannotSetAPasswordWithTheirLeftoverToken() {
		var squatter = registration.create("Squatter", "dee@example.com", "squatter pass");
		var squatterToken = tokenFor(squatter);
		var owner = externalSignIn.signIn(profile("google", "g-dee", "dee@example.com"));
		assertThat(owner.getId()).isEqualTo(squatter.getId());

		setPassword(squatterToken, Map.of("newPassword", "squatter again")).expectStatus().isUnauthorized();
		assertThatThrownBy(() -> signIn.signIn("dee@example.com", "squatter again", "client-dee"))
			.isInstanceOf(SignIn.InvalidCredentialsException.class);

		setPassword(tokenFor(owner), Map.of("newPassword", "owners password")).expectStatus().isNoContent();
		login("dee@example.com", "owners password").expectStatus().isOk();
	}

	@Test
	void aGoogleOnlyUserCanSetAPasswordWithAResetCodeAndKeepsTheirGoogleLogin() {
		var user = externalSignIn.signIn(profile("google", "g-gina", "gina@example.com"));
		assertThat(user.passwordHash()).isNull();

		client.post().uri("/api/auth/password-reset").body(Map.of("email", "gina@example.com"))
			.exchange().expectStatus().isNoContent();
		await().atMost(Duration.ofSeconds(10)).until(() -> !RecordingMailer.sentTo("gina@example.com").isEmpty());
		client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", "gina@example.com", "code", RecordingMailer.lastCodeFor("gina@example.com"),
					"newPassword", "first password"))
			.exchange().expectStatus().isNoContent();

		login("gina@example.com", "first password").expectStatus().isOk();
		assertThat(externalSignIn.signIn(profile("google", "g-gina", "gina@example.com")).getId())
			.isEqualTo(user.getId());
	}

	private void hasPassword(String accessToken, boolean expected) {
		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.hasPassword").isEqualTo(expected)
			.jsonPath("$.passwordHash").doesNotExist();
	}

	private String tokenFor(User user) {
		return accessTokens.issueFor(user, sessions.start(user).sessionId());
	}

	private RestTestClient.ResponseSpec setPassword(String accessToken, Map<String, String> body) {
		return client.put().uri("/api/users/me/password")
			.header("Authorization", "Bearer " + accessToken)
			.body(body)
			.exchange();
	}

	private RestTestClient.ResponseSpec login(String email, String password) {
		return client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", password))
			.exchange();
	}

	private static ExternalProfile profile(String provider, String id, String email) {
		return new ExternalProfile(provider, id, email, true, "Someone", null);
	}

}
