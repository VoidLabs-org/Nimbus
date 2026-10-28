package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import javax.imageio.ImageIO;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import com.nimbus.api.identity.MovableClock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Choosing what the Profile picture shows: the uploaded photo, a connected provider's picture, or initials. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProfilePictureSourceTests {

	private static final String PASSWORD = "correct horse";

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	MovableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void eachAvailableChoiceChangesWhatIsShownAndSavesAtOnce() {
		var token = verifiedUser("ps1@example.com");
		externalSignIn.signIn(google("ps1@example.com", "https://lh3.example.com/ps1.png"));
		clock.advance(Duration.ofMinutes(1));
		externalSignIn.signIn(github("ps1@example.com", "https://avatars.example.com/ps1.png"));
		var uploaded = avatarOf(upload(token));

		choose(token, "google").expectStatus().isOk().expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/ps1.png")
			.jsonPath("$.pictureSource").isEqualTo("google");
		choose(token, "github").expectStatus().isOk().expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://avatars.example.com/ps1.png")
			.jsonPath("$.pictureSource").isEqualTo("github");
		choose(token, "initials").expectStatus().isOk().expectBody()
			.jsonPath("$.avatarUrl").isEmpty()
			.jsonPath("$.pictureSource").isEqualTo("initials");
		choose(token, "uploaded").expectStatus().isOk().expectBody()
			.jsonPath("$.avatarUrl").isEqualTo(uploaded)
			.jsonPath("$.pictureSource").isEqualTo("uploaded");

		// Saved: a fresh read gives the same.
		me(token).expectBody().jsonPath("$.avatarUrl").isEqualTo(uploaded);
	}

	@Test
	void anOptionTheUserDoesntHaveIsRefused() {
		var token = verifiedUser("ps2@example.com");
		externalSignIn.signIn(google("ps2@example.com", null));

		// No upload, GitHub not connected, Google connected but without a picture, and a word that is no option.
		for (var source : new String[] { "uploaded", "github", "google", "gravatar" }) {
			choose(token, source).expectStatus().isBadRequest().expectBody()
				.jsonPath("$.code").isEqualTo("source_unavailable");
		}
		me(token).expectBody().jsonPath("$.avatarUrl").isEmpty();
		choose(token, "initials").expectStatus().isOk();
	}

	@Test
	void nobodyCanChooseWithoutSigningIn() {
		client.put().uri("/api/users/me/profile-picture/source").body(Map.of("source", "initials"))
			.exchange().expectStatus().isUnauthorized();
	}

	@Test
	void theUserResponseListsTheOptions() {
		var token = verifiedUser("ps3@example.com");
		externalSignIn.signIn(google("ps3@example.com", "https://lh3.example.com/ps3.png"));
		externalSignIn.signIn(new ExternalProfile("github", "gh-ps3", "ps3@example.com", true, "Someone",
				"https://avatars.example.com/ps3.png", "ps3-codes"));
		me(token).expectBody()
			.jsonPath("$.pictureOptions.uploadedAt").isEmpty()
			.jsonPath("$.pictureOptions.providers.length()").isEqualTo(2)
			.jsonPath("$.pictureOptions.providers[0].provider").isEqualTo("google")
			.jsonPath("$.pictureOptions.providers[0].label").isEqualTo("ps3@example.com")
			.jsonPath("$.pictureOptions.providers[0].pictureUrl").isEqualTo("https://lh3.example.com/ps3.png")
			.jsonPath("$.pictureOptions.providers[1].provider").isEqualTo("github")
			.jsonPath("$.pictureOptions.providers[1].label").isEqualTo("ps3-codes");

		var uploaded = avatarOf(upload(token));
		choose(token, "initials").expectStatus().isOk();
		// The photo is still offered, with its thumbnail, while it isn't the one shown.
		me(token).expectBody()
			.jsonPath("$.pictureOptions.uploadedAt").isNotEmpty()
			.jsonPath("$.pictureOptions.uploadedUrl").isEqualTo(uploaded);
	}

	@Test
	void aProviderWithoutAPictureIsNotListed() {
		var token = verifiedUser("ps4@example.com");
		externalSignIn.signIn(google("ps4@example.com", null));

		me(token).expectBody().jsonPath("$.pictureOptions.providers.length()").isEqualTo(0);
	}

	@Test
	void aSignInRefreshesOnlyItsOwnPictureAndKeepsTheChoice() {
		var token = verifiedUser("ps5@example.com");
		externalSignIn.signIn(google("ps5@example.com", "https://lh3.example.com/old.png"));
		externalSignIn.signIn(github("ps5@example.com", "https://avatars.example.com/old.png"));
		choose(token, "github").expectStatus().isOk();

		externalSignIn.signIn(google("ps5@example.com", "https://lh3.example.com/new.png"));

		me(token).expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://avatars.example.com/old.png")
			.jsonPath("$.pictureSource").isEqualTo("github")
			.jsonPath("$.pictureOptions.providers[0].pictureUrl").isEqualTo("https://lh3.example.com/new.png")
			.jsonPath("$.pictureOptions.providers[1].pictureUrl").isEqualTo("https://avatars.example.com/old.png");
		choose(token, "google").expectBody().jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/new.png");
	}

	@Test
	void aSignInWithoutAPictureKeepsTheOneWeHave() {
		var token = verifiedUser("ps6@example.com");
		externalSignIn.signIn(google("ps6@example.com", "https://lh3.example.com/ps6.png"));

		externalSignIn.signIn(google("ps6@example.com", null));

		me(token).expectBody().jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/ps6.png");
	}

	@Test
	void neverChosenShowsTheEarliestLinkedPictureWhateverSignedInLast() {
		var token = verifiedUser("ps7@example.com");
		externalSignIn.signIn(github("ps7@example.com", "https://avatars.example.com/ps7.png"));
		clock.advance(Duration.ofMinutes(1));
		externalSignIn.signIn(google("ps7@example.com", "https://lh3.example.com/ps7.png"));

		me(token).expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://avatars.example.com/ps7.png")
			.jsonPath("$.pictureSource").isEqualTo("github");
		// Signing in with the later one doesn't flip it.
		externalSignIn.signIn(google("ps7@example.com", "https://lh3.example.com/ps7-b.png"));
		me(token).expectBody().jsonPath("$.avatarUrl").isEqualTo("https://avatars.example.com/ps7.png");
	}

	@Test
	void anEarlierLinkedIdentityWithoutAPictureIsSkipped() {
		var token = verifiedUser("ps8@example.com");
		externalSignIn.signIn(github("ps8@example.com", null));
		clock.advance(Duration.ofMinutes(1));
		externalSignIn.signIn(google("ps8@example.com", "https://lh3.example.com/ps8.png"));

		me(token).expectBody().jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/ps8.png");
	}

	@Test
	void disconnectingTheProviderThatIsShownShowsInitials() {
		var token = verifiedUser("ps9@example.com");
		externalSignIn.signIn(google("ps9@example.com", "https://lh3.example.com/ps9.png"));
		externalSignIn.signIn(github("ps9@example.com", "https://avatars.example.com/ps9.png"));
		choose(token, "google").expectStatus().isOk();

		disconnect(token, "google");

		me(token).expectBody()
			.jsonPath("$.avatarUrl").isEmpty()
			.jsonPath("$.pictureSource").isEqualTo("initials")
			.jsonPath("$.pictureOptions.providers.length()").isEqualTo(1);
	}

	@Test
	void disconnectingAProviderThatIsNotShownChangesNothing() {
		var token = verifiedUser("ps10@example.com");
		externalSignIn.signIn(google("ps10@example.com", "https://lh3.example.com/ps10.png"));
		externalSignIn.signIn(github("ps10@example.com", "https://avatars.example.com/ps10.png"));
		choose(token, "github").expectStatus().isOk();

		disconnect(token, "google");

		me(token).expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://avatars.example.com/ps10.png")
			.jsonPath("$.pictureSource").isEqualTo("github");
	}

	@Test
	void aMigratedUsersOldPictureStaysUntilTheirNextProviderSignInFillsOne() {
		var token = verifiedUser("ps11@example.com");
		externalSignIn.signIn(google("ps11@example.com", null));
		var id = idOf(token);
		// What V22 and earlier left: a picture on the User, nothing on the identity, nothing chosen.
		jdbc.update("UPDATE users SET avatar_url = ? WHERE id = ?", "https://lh3.example.com/legacy.png", id);

		me(token).expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/legacy.png")
			.jsonPath("$.pictureSource").isEmpty();

		externalSignIn.signIn(google("ps11@example.com", "https://lh3.example.com/fresh.png"));

		me(token).expectBody()
			.jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/fresh.png")
			.jsonPath("$.pictureSource").isEqualTo("google");
		assertThat(jdbc.queryForObject("SELECT avatar_url FROM users WHERE id = ?", String.class, id)).isNull();
	}

	@Test
	void connectingAnotherProviderKeepsAMigratedUsersOldPicture() {
		var token = verifiedUser("ps13@example.com");
		externalSignIn.signIn(google("ps13@example.com", null));
		jdbc.update("UPDATE users SET avatar_url = ? WHERE id = ?", "https://lh3.example.com/legacy13.png",
				idOf(token));

		externalSignIn.signIn(github("ps13@example.com", "https://avatars.example.com/ps13.png"));

		me(token).expectBody().jsonPath("$.avatarUrl").isEqualTo("https://lh3.example.com/legacy13.png");
		// The new provider is still a choice.
		choose(token, "github").expectStatus().isOk();
	}

	@Test
	void disconnectingAProviderTakesAMigratedUsersOldPictureWithIt() {
		var token = verifiedUser("ps14@example.com");
		externalSignIn.signIn(google("ps14@example.com", null));
		var id = idOf(token);
		jdbc.update("UPDATE users SET avatar_url = ? WHERE id = ?", "https://lh3.example.com/legacy14.png", id);

		disconnect(token, "google");

		me(token).expectBody().jsonPath("$.avatarUrl").isEmpty().jsonPath("$.pictureSource").isEqualTo("initials");
		assertThat(jdbc.queryForObject("SELECT avatar_url FROM users WHERE id = ?", String.class, id)).isNull();
	}

	@Test
	void aDeletedPhotoNoLongerCountsAsAnOption() {
		var token = verifiedUser("ps12@example.com");
		upload(token).expectStatus().isOk();
		client.delete().uri("/api/users/me/profile-picture").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isNoContent();

		choose(token, "uploaded").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("source_unavailable");
	}

	private String verifiedUser(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

	private static ExternalProfile google(String email, String picture) {
		return new ExternalProfile("google", "g-" + email, email, true, "Someone", picture, email);
	}

	private static ExternalProfile github(String email, String picture) {
		return new ExternalProfile("github", "gh-" + email, email, true, "Someone", picture, "octo-" + email);
	}

	private RestTestClient.ResponseSpec choose(String token, String source) {
		return client.put().uri("/api/users/me/profile-picture/source").header("Authorization", "Bearer " + token)
			.body(Map.of("source", source))
			.exchange();
	}

	private void disconnect(String token, String provider) {
		client.delete().uri("/api/users/me/linked-identities/" + provider).header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isNoContent();
	}

	private RestTestClient.ResponseSpec me(String token) {
		return client.get().uri("/api/users/me").header("Authorization", "Bearer " + token).exchange();
	}

	private UUID idOf(String token) {
		var body = me(token).expectBody(String.class).returnResult().getResponseBody();
		return UUID.fromString(JsonPath.read(body, "$.id"));
	}

	private static String avatarOf(RestTestClient.ResponseSpec upload) {
		var body = upload.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.avatarUrl");
	}

	private RestTestClient.ResponseSpec upload(String token) {
		var form = new MultipartBodyBuilder();
		form.part("file", new ByteArrayResource(png()) {

			@Override
			public String getFilename() {
				return "me.png";
			}

		}).contentType(MediaType.IMAGE_PNG);
		return client.put().uri("/api/users/me/profile-picture").header("Authorization", "Bearer " + token)
			.contentType(MediaType.MULTIPART_FORM_DATA)
			.body(form.build())
			.exchange();
	}

	private static byte[] png() {
		var image = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
		var out = new ByteArrayOutputStream();
		try {
			ImageIO.write(image, "png", out);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
		return out.toByteArray();
	}

}
