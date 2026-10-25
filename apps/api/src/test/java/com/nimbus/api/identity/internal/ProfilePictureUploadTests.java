package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.imageio.ImageIO;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import com.nimbus.api.identity.RefreshCookies;
import com.nimbus.api.identity.Users;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Uploading a Profile picture from Profile, and loading it back the way an {@code <img>} does: without signing in.
 * Pictures go to MinIO in a container.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProfilePictureUploadTests {

	private static final String PASSWORD = "correct horse";

	private static final int FIVE_MB = 5 * 1024 * 1024;

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Users users;

	@Test
	void anUploadedPhotoIsServedAsA256PixelJpegThatBrowsersMayCacheForever() throws IOException {
		var token = verifiedUser("pp1@example.com");

		var response = upload(token, png(600, 400, true), "photo.png", "image/png").expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		String avatarUrl = JsonPath.read(response, "$.avatarUrl");
		assertThat(avatarUrl).startsWith("/api/profile-pictures/");
		assertThat((String) JsonPath.read(response, "$.email")).isEqualTo("pp1@example.com");

		var served = client.get().uri(avatarUrl).exchange().expectStatus().isOk()
			.expectHeader().contentType(MediaType.IMAGE_JPEG)
			.expectHeader().valueEquals("Cache-Control", "public, max-age=31536000, immutable")
			.expectBody(byte[].class).returnResult().getResponseBody();
		var picture = ImageIO.read(new ByteArrayInputStream(served));
		assertThat(picture.getWidth()).isEqualTo(256);
		assertThat(picture.getHeight()).isEqualTo(256);
		// The transparent corner is laid on white; the middle of the centred square is the opaque blue.
		assertThat(nearly(picture.getRGB(2, 2), Color.WHITE)).isTrue();
		assertThat(nearly(picture.getRGB(128, 128), Color.BLUE)).isTrue();

		me(token).expectStatus().isOk().expectBody().jsonPath("$.avatarUrl").isEqualTo(avatarUrl);
	}

	@Test
	void aPhonePhotosLocationDataIsNotKept() {
		var token = verifiedUser("pp2@example.com");
		var withExif = jpegWithExif(320, 320, "GPS 6.9271 N 79.8612 E");
		assertThat(contains(withExif, "Exif".getBytes(StandardCharsets.US_ASCII))).isTrue();

		var served = fetch(avatarOf(upload(token, withExif, "IMG_0001.jpg", "image/jpeg")));

		assertThat(contains(served, "Exif".getBytes(StandardCharsets.US_ASCII))).isFalse();
		assertThat(contains(served, "GPS".getBytes(StandardCharsets.US_ASCII))).isFalse();
	}

	@Test
	void aWebpIsAcceptedAndCroppedToItsCentre() throws IOException {
		var token = verifiedUser("pp3@example.com");
		byte[] webp;
		try (var in = getClass().getResourceAsStream("/pictures/landscape.webp")) {
			webp = in.readAllBytes();
		}

		var picture = ImageIO.read(new ByteArrayInputStream(fetch(avatarOf(upload(token, webp, "me.webp", "image/webp")))));

		assertThat(picture.getWidth()).isEqualTo(256);
		// The fixture is 40x30, blue with a yellow square in the middle: the centred 30x30 square keeps it there.
		assertThat(nearly(picture.getRGB(128, 128), new Color(250, 200, 10))).isTrue();
		assertThat(nearly(picture.getRGB(4, 4), new Color(20, 120, 200))).isTrue();
	}

	@Test
	void aFileOverFiveMegabytesIsRefusedWhateverItsSize() {
		var token = verifiedUser("pp4@example.com");
		var justOver = Arrays.copyOf(png(10, 10, false), FIVE_MB + 1);
		var wellOver = Arrays.copyOf(png(10, 10, false), FIVE_MB + 1024 * 1024);

		upload(token, justOver, "big.png", "image/png").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("file_too_large");
		upload(token, wellOver, "bigger.png", "image/png").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("file_too_large");

		me(token).expectStatus().isOk().expectBody().jsonPath("$.avatarUrl").isEmpty();
	}

	@Test
	void anythingButJpegPngOrWebpIsRefusedWhateverItClaimsToBe() {
		var token = verifiedUser("pp5@example.com");
		var gif = new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0 };

		upload(token, gif, "funny.gif", "image/gif").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("unsupported_type");
		upload(token, "not a picture".getBytes(StandardCharsets.UTF_8), "notes.png", "image/png")
			.expectStatus().isBadRequest().expectBody().jsonPath("$.code").isEqualTo("unsupported_type");
	}

	@Test
	void aBrokenImageIsRefusedAsUnreadable() {
		var token = verifiedUser("pp6@example.com");
		var png = png(50, 50, false);
		var truncated = Arrays.copyOf(png, 40);

		upload(token, truncated, "broken.png", "image/png").expectStatus().isBadRequest().expectBody()
			.jsonPath("$.code").isEqualTo("unreadable_image");
	}

	@Test
	void anUnknownOrMalformedPictureAddressIsNotFound() {
		client.get().uri("/api/profile-pictures/" + UUID.randomUUID().toString().replace("-", "").substring(0, 22))
			.exchange().expectStatus().isNotFound();
		client.get().uri("/api/profile-pictures/not-a-key").exchange().expectStatus().isNotFound();
	}

	@Test
	void aLaterGoogleSignInLeavesTheUploadedPhotoShown() {
		var token = verifiedUser("pp7@example.com");
		externalSignIn.signIn(google("pp7@example.com", "https://lh3.example.com/first.png"));
		me(token).expectStatus().isOk().expectBody().jsonPath("$.avatarUrl")
			.isEqualTo("https://lh3.example.com/first.png");

		var uploaded = avatarOf(upload(token, png(64, 64, false), "me.png", "image/png"));
		externalSignIn.signIn(google("pp7@example.com", "https://lh3.example.com/second.png"));

		me(token).expectStatus().isOk().expectBody().jsonPath("$.avatarUrl").isEqualTo(uploaded);
	}

	@Test
	void otherModulesSeeTheUploadedPhoto() {
		var token = verifiedUser("pp8@example.com");
		var uploaded = avatarOf(upload(token, png(64, 64, false), "me.png", "image/png"));

		var summary = users.findByEmail("pp8@example.com").orElseThrow();
		assertThat(summary.avatarUrl()).isEqualTo(uploaded);
		assertThat(users.findAllById(List.of(summary.id()))).singleElement()
			.satisfies(user -> assertThat(user.avatarUrl()).isEqualTo(uploaded));
	}

	@Test
	void aNewUploadGetsANewAddress() {
		var token = verifiedUser("pp9@example.com");
		var first = avatarOf(upload(token, png(64, 64, false), "a.png", "image/png"));

		var second = avatarOf(upload(token, png(80, 80, false), "b.png", "image/png"));

		assertThat(second).isNotEqualTo(first);
		fetch(second);
	}

	@Test
	void anUnverifiedUserOrNobodyCantUpload() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "pp10@example.com", "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String unverified = JsonPath.read(response, "$.accessToken");

		upload(unverified, png(64, 64, false), "me.png", "image/png").expectStatus().isForbidden().expectBody()
			.jsonPath("$.code").isEqualTo("email_unverified");
		client.put().uri("/api/users/me/profile-picture").contentType(MediaType.MULTIPART_FORM_DATA)
			.body(form(png(64, 64, false), "me.png", "image/png"))
			.exchange().expectStatus().isUnauthorized();
	}

	@Test
	void aSignedOutSessionCantUpload() {
		var signedIn = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "pp11@example.com", "password", PASSWORD))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult();
		String token = JsonPath.read(signedIn.getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, token, "pp11@example.com");
		client.post().uri("/api/auth/logout").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", RefreshCookies.valueOf(signedIn))
			.exchange().expectStatus().is2xxSuccessful();

		upload(token, png(64, 64, false), "me.png", "image/png").expectStatus().isUnauthorized();
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

	private RestTestClient.ResponseSpec upload(String token, byte[] file, String name, String type) {
		return client.put().uri("/api/users/me/profile-picture").header("Authorization", "Bearer " + token)
			.contentType(MediaType.MULTIPART_FORM_DATA)
			.body(form(file, name, type))
			.exchange();
	}

	private static Object form(byte[] file, String name, String type) {
		var form = new MultipartBodyBuilder();
		form.part("file", new ByteArrayResource(file) {

			@Override
			public String getFilename() {
				return name;
			}

		}).contentType(MediaType.parseMediaType(type));
		return form.build();
	}

	private static String avatarOf(RestTestClient.ResponseSpec upload) {
		var body = upload.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.avatarUrl");
	}

	private byte[] fetch(String avatarUrl) {
		return client.get().uri(avatarUrl).exchange().expectStatus().isOk()
			.expectBody(byte[].class).returnResult().getResponseBody();
	}

	private RestTestClient.ResponseSpec me(String token) {
		return client.get().uri("/api/users/me").header("Authorization", "Bearer " + token).exchange();
	}

	/** Blue, with the outer quarter on each side transparent when asked: only a centred square stays opaque. */
	private static byte[] png(int width, int height, boolean transparentEdges) {
		var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
		for (var x = 0; x < width; x++) {
			for (var y = 0; y < height; y++) {
				var edge = x < width / 4 || x >= width * 3 / 4 || y < height / 4 || y >= height * 3 / 4;
				image.setRGB(x, y, transparentEdges && edge ? 0x000000FF : 0xFF0000FF);
			}
		}
		return encode(image, "png");
	}

	/** A JPEG with an Exif block (APP1) right after the start marker, the way cameras write it. */
	private static byte[] jpegWithExif(int width, int height, String exifText) {
		var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		var jpeg = encode(image, "jpg");
		var payload = ("Exif\0\0" + exifText).getBytes(StandardCharsets.ISO_8859_1);
		var segment = new ByteArrayOutputStream();
		segment.write(0xFF);
		segment.write(0xE1);
		segment.write((payload.length + 2) >> 8);
		segment.write((payload.length + 2) & 0xFF);
		segment.writeBytes(payload);
		var out = new ByteArrayOutputStream();
		out.write(jpeg, 0, 2);
		out.writeBytes(segment.toByteArray());
		out.write(jpeg, 2, jpeg.length - 2);
		return out.toByteArray();
	}

	private static byte[] encode(BufferedImage image, String format) {
		var out = new ByteArrayOutputStream();
		try {
			ImageIO.write(image, format, out);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
		return out.toByteArray();
	}

	private static boolean contains(byte[] haystack, byte[] needle) {
		outer: for (var i = 0; i <= haystack.length - needle.length; i++) {
			for (var j = 0; j < needle.length; j++) {
				if (haystack[i + j] != needle[j]) {
					continue outer;
				}
			}
			return true;
		}
		return false;
	}

	/** Within JPEG's rounding of the colour. */
	private static boolean nearly(int rgb, Color expected) {
		var actual = new Color(rgb);
		return Math.abs(actual.getRed() - expected.getRed()) < 24
				&& Math.abs(actual.getGreen() - expected.getGreen()) < 24
				&& Math.abs(actual.getBlue() - expected.getBlue()) < 24;
	}

}
