package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

/** Maps recorded GitHub API responses (GET /user and GET /user/emails), so a change in what GitHub sends shows up here. */
class GithubProfilesTests {

	@Test
	void usesThePrimaryVerifiedEmailAndTheGithubIdAsTheProviderUserId() throws IOException {
		var profile = GithubProfiles.from(attributes("user", "emails"));

		assertThat(profile).isEqualTo(new ExternalProfile("github", "583231", "octo.cat@example.com", true,
				"The Octocat", "https://avatars.githubusercontent.com/u/583231?v=4"));
	}

	@Test
	void aPrimaryEmailGithubHasNotVerifiedIsNotVerifiedEvenIfAnotherAddressIs() throws IOException {
		var profile = GithubProfiles.from(attributes("user", "emails-primary-unverified"));

		assertThat(profile.emailVerified()).isFalse();
	}

	@Test
	void anAccountWithNoEmailsAtAllHasNoEmailAndIsNotVerified() throws IOException {
		var profile = GithubProfiles.from(attributes("user", null));

		assertThat(profile.email()).isNull();
		assertThat(profile.emailVerified()).isFalse();
	}

	@Test
	void anEmptyNameFallsBackToTheGithubUsername() throws IOException {
		var profile = GithubProfiles.from(attributes("user-without-name", "emails"));

		assertThat(profile.name()).isEqualTo("ghost-writer");
	}

	/** What the sign-in wiring hands over: the /user fields plus the /user/emails list under {@code emails}. */
	private static Map<String, Object> attributes(String user, String emails) throws IOException {
		var attributes = new HashMap<String, Object>(recorded(user));
		if (emails != null) {
			attributes.put(GithubProfiles.EMAILS_ATTRIBUTE, List.copyOf(recorded(emails)));
		}
		return attributes;
	}

	private static <T> T recorded(String name) throws IOException {
		try (var json = GithubProfilesTests.class.getResourceAsStream("/github/" + name + ".json")) {
			return JsonPath.parse(json).read("$");
		}
	}

}
