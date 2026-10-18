package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

/** Maps recorded Google ID-token claims, so a change in what Google sends shows up here. */
class GoogleProfilesTests {

	@Test
	void verifiedUserMapsToAnExternalProfile() throws IOException {
		var profile = GoogleProfiles.from(recorded("verified-user"));

		assertThat(profile).isEqualTo(new ExternalProfile("google", "110169484474386276334",
				"ada.lovelace@example.com", true, "Ada Lovelace",
				"https://lh3.googleusercontent.com/a/ACg8ocKexample=s96-c", "ada.lovelace@example.com"));
	}

	@Test
	void theAccountNameIsTheEmailInLowerCase() throws IOException {
		var claims = new java.util.HashMap<>(recorded("minimal-user"));
		claims.put("email", "No.Name@Example.com");

		assertThat(GoogleProfiles.from(claims).accountName()).isEqualTo("no.name@example.com");
	}

	@Test
	void withNoEmailThereIsNoAccountName() throws IOException {
		var claims = new java.util.HashMap<>(recorded("minimal-user"));
		claims.remove("email");

		assertThat(GoogleProfiles.from(claims).accountName()).isNull();
	}

	@Test
	void emailVerifiedFalseIsKept() throws IOException {
		var profile = GoogleProfiles.from(recorded("unverified-user"));

		assertThat(profile.emailVerified()).isFalse();
		assertThat(profile.email()).isEqualTo("grace@example.com");
	}

	@Test
	void missingNameAndPictureAreNullAndAStringTrueCountsAsVerified() throws IOException {
		var profile = GoogleProfiles.from(recorded("minimal-user"));

		assertThat(profile.name()).isNull();
		assertThat(profile.avatarUrl()).isNull();
		assertThat(profile.emailVerified()).isTrue();
	}

	private static Map<String, Object> recorded(String name) throws IOException {
		try (var json = GoogleProfilesTests.class.getResourceAsStream("/google/" + name + ".json")) {
			return JsonPath.parse(json).read("$");
		}
	}

}
