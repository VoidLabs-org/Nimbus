package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SignedInUserTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JwtEncoder jwtEncoder;

	@Test
	void validTokenForAUserWhoNoLongerExistsIsRejectedAsAnInvalidToken() {
		var now = Instant.now();
		var claims = JwtClaimsSet.builder()
			.subject(UUID.randomUUID().toString())
			.issuedAt(now)
			.expiresAt(now.plusSeconds(60))
			.build();
		var token = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
			.getTokenValue();

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + token)
			.exchange()
			.expectStatus().isUnauthorized()
			.expectHeader().value("WWW-Authenticate", value -> assertThat(value).contains("invalid_token"));
	}

	@Test
	void signedInUserCanSeeWhoTheyAre() {
		var registration = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", "dana@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String accessToken = JsonPath.read(registration, "$.accessToken");
		String id = JsonPath.read(registration, "$.user.id");

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.id").isEqualTo(id)
			.jsonPath("$.email").isEqualTo("dana@example.com")
			.jsonPath("$.displayName").isEqualTo("Dana")
			.jsonPath("$.passwordHash").doesNotExist();
	}

	@Test
	void signedInUserCanChangeTheirDisplayName() {
		var accessToken = registerAndGetAccessToken("rename@example.com");

		client.patch().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.body(Map.of("displayName", "  Dana Scully  "))
			.exchange()
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Dana Scully")
			.jsonPath("$.email").isEqualTo("rename@example.com");

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Dana Scully");
	}

	@Test
	void blankDisplayNameIsRejectedAndTheNameStays() {
		var accessToken = registerAndGetAccessToken("blank@example.com");

		client.patch().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.body(Map.of("displayName", "   "))
			.exchange()
			.expectStatus().isBadRequest()
			.expectBody()
			.jsonPath("$.errors.displayName").exists();

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Dana");
	}

	@Test
	void displayNameOverOneHundredCharactersOrWithControlCharactersIsRejected() {
		var accessToken = registerAndGetAccessToken("invalid@example.com");

		for (var invalid : new String[] { "x".repeat(101), "Da\nna" }) {
			client.patch().uri("/api/users/me")
				.header("Authorization", "Bearer " + accessToken)
				.body(Map.of("displayName", invalid))
				.exchange()
				.expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.errors.displayName").exists();
		}

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Dana");
	}

	@Test
	void emailPasswordAndAvatarCannotBeChangedThroughTheProfileEndpoint() {
		var accessToken = registerAndGetAccessToken("fixed@example.com");

		client.patch().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.body(Map.of("displayName", "Dana S", "email", "other@example.com", "password", "new password!",
					"avatarUrl", "https://example.com/a.png"))
			.exchange()
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Dana S")
			.jsonPath("$.email").isEqualTo("fixed@example.com")
			.jsonPath("$.avatarUrl").doesNotExist();

		client.post().uri("/api/auth/login")
			.body(Map.of("email", "fixed@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isOk();
	}

	@Test
	void profileCannotBeChangedWithoutSigningIn() {
		client.patch().uri("/api/users/me")
			.body(Map.of("displayName", "Mallory"))
			.exchange()
			.expectStatus().isUnauthorized();
	}

	private String registerAndGetAccessToken(String email) {
		var registration = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(registration, "$.accessToken");
	}

	@Test
	void protectedEndpointsRejectRequestsWithoutAValidAccessToken() {
		client.get().uri("/api/users/me").exchange().expectStatus().isUnauthorized();

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer not.a.token")
			.exchange()
			.expectStatus().isUnauthorized();
	}

	@Test
	void accessTokenSignedWithAnotherKeyIsRejected() {
		// Header {"alg":"HS256"}, payload {"sub":"<random uuid>","exp":9999999999}, signed with a different key.
		var forged = "eyJhbGciOiJIUzI1NiJ9"
				+ ".eyJzdWIiOiIzZjI1YzQ5Mi1hMWI0LTRmNzMtOWUzZC1iMGI0ZDY1YzhhMTEiLCJleHAiOjk5OTk5OTk5OTl9"
				+ ".mR5c2q3vUQ6p0cHn7VX9ag2Yq8m0y8m2wq8kTqL3a0Y";

		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + forged)
			.exchange()
			.expectStatus().isUnauthorized();
	}

}
