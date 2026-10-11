package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.HttpCookie;
import java.time.Duration;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SessionTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void signingInSetsAnHttpOnlyRefreshCookieThatPageScriptsCannotRead() {
		register("Ada", "ada@example.com");

		var result = signIn("ada@example.com").expectStatus().isOk().expectBody(String.class).returnResult();

		var setCookie = result.getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE);
		assertThat(setCookie).contains("HttpOnly").contains("Secure").contains("SameSite=Strict")
			.contains("Path=/api/auth");
		var cookie = refreshCookie(result);
		assertThat(cookie.getValue()).isNotBlank();
		assertThat(cookie.getMaxAge()).isPositive();
		assertThat(result.getResponseBody()).doesNotContain(cookie.getValue());
	}

	@Test
	void registeringAlsoStartsASession() {
		var result = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ida", "email", "ida@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult();

		assertThat(result.getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE)).contains("HttpOnly")
			.contains("Secure").contains("SameSite=Strict").contains("Path=/api/auth");
		refresh(refreshCookie(result).getValue()).expectStatus().isOk()
			.expectBody().jsonPath("$.user.displayName").isEqualTo("Ida");
	}

	@Test
	void refreshingRotatesTheCookieAndReturnsAWorkingAccessToken() {
		register("Babbage", "babbage@example.com");
		var signedIn = refreshCookie(signIn("babbage@example.com").expectBody(String.class).returnResult());

		var result = refresh(signedIn.getValue()).expectStatus().isOk()
			.expectHeader().value("Cache-Control", value -> assertThat(value).contains("no-store"))
			.expectBody(String.class).returnResult();

		var rotated = refreshCookie(result);
		assertThat(rotated.getValue()).isNotBlank().isNotEqualTo(signedIn.getValue());
		assertThat(result.getResponseBody()).doesNotContain(rotated.getValue());
		assertThat(JsonPath.<String>read(result.getResponseBody(), "$.user.email")).isEqualTo("babbage@example.com");
		String accessToken = JsonPath.read(result.getResponseBody(), "$.accessToken");
		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectStatus().isOk()
			.expectBody().jsonPath("$.displayName").isEqualTo("Babbage");
	}

	// A used token showing up again means someone copied it; neither copy may keep the session alive.
	@Test
	void reusingARefreshTokenEndsThatWholeSessionButNoOther() {
		register("Curie", "curie@example.com");
		var laptop = signedInToken("curie@example.com");
		var phone = signedInToken("curie@example.com");
		var laptopNext = refreshedToken(laptop);

		refresh(laptop).expectStatus().isUnauthorized();

		refresh(laptopNext).expectStatus().isUnauthorized();
		refresh(phone).expectStatus().isOk();
	}

	@Test
	void refreshingOneSessionDoesNotAffectAnother() {
		register("Dijkstra", "dijkstra@example.com");
		var laptop = signedInToken("dijkstra@example.com");
		var phone = signedInToken("dijkstra@example.com");

		refreshedToken(refreshedToken(laptop));

		refreshedToken(phone);
	}

	@Test
	void sessionEndsAfter30DaysWithoutUse() {
		register("Euler", "euler@example.com");
		var active = signedInToken("euler@example.com");
		var idle = signedInToken("euler@example.com");

		clock.advance(Duration.ofDays(29));
		active = refreshedToken(active);
		clock.advance(Duration.ofDays(1).plusSeconds(1));

		refresh(idle).expectStatus().isUnauthorized();
		refresh(active).expectStatus().isOk();
	}

	@Test
	void sessionEndsAfter90DaysHoweverActive() {
		register("Fermat", "fermat@example.com");
		var token = signedInToken("fermat@example.com");

		for (var day = 25; day < 90; day += 25) {
			clock.advance(Duration.ofDays(25));
			token = refreshedToken(token);
		}
		// Day 75: the last token may live only until day 90, not day 105.
		clock.advance(Duration.ofDays(15));

		refresh(token).expectStatus().isUnauthorized();
	}

	@Test
	void refreshCookieExpiresWithTheSession() {
		register("Gauss", "gauss@example.com");
		var token = signedInToken("gauss@example.com");

		for (var day = 20; day <= 80; day += 20) {
			clock.advance(Duration.ofDays(20));
			token = refreshedToken(token);
		}
		var cookie = refreshCookie(refresh(token).expectStatus().isOk().expectBody(String.class).returnResult());

		assertThat(cookie.getMaxAge()).isEqualTo(Duration.ofDays(10).toSeconds());
	}

	// A cross-site form can't set custom headers, so this stops other sites from using the cookie.
	@Test
	void refreshNeedsTheNimbusRequestHeader() {
		register("Hopper", "hopper@example.com");
		var token = signedInToken("hopper@example.com");

		client.post().uri("/api/auth/refresh")
			.cookie("refresh_token", token)
			.exchange()
			.expectStatus().isForbidden();
		client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "XMLHttpRequest")
			.cookie("refresh_token", token)
			.exchange()
			.expectStatus().isForbidden();

		refresh(token).expectStatus().isOk();
	}

	@Test
	void missingOrUnknownRefreshTokenIsRejected() {
		client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.exchange()
			.expectStatus().isUnauthorized();

		refresh("not-a-token").expectStatus().isUnauthorized();
	}

	private String signedInToken(String email) {
		return refreshCookie(signIn(email).expectStatus().isOk().expectBody(String.class).returnResult()).getValue();
	}

	private String refreshedToken(String refreshToken) {
		return refreshCookie(refresh(refreshToken).expectStatus().isOk().expectBody(String.class).returnResult())
			.getValue();
	}

	private RestTestClient.ResponseSpec refresh(String refreshToken) {
		return client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange();
	}

	private void register(String displayName, String email) {
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated();
	}

	private RestTestClient.ResponseSpec signIn(String email) {
		return client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", "correct horse"))
			.exchange();
	}

	private static HttpCookie refreshCookie(EntityExchangeResult<?> result) {
		return result.getResponseHeaders().getValuesAsList(HttpHeaders.SET_COOKIE).stream()
			.flatMap(header -> HttpCookie.parse(header).stream())
			.filter(cookie -> cookie.getName().equals("refresh_token"))
			.findFirst()
			.orElseThrow(() -> new AssertionError("no refresh_token cookie was set"));
	}

}
