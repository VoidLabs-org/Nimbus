package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * One rule for what a display name may be, whether it is given at registration or on rename. Characters are
 * written as escapes, because the point is that they cannot be seen.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class DisplayNameTests {

	private static final AtomicInteger EMAILS = new AtomicInteger();

	/** Each of these would show as an empty or misleading name in a menu or on a board. */
	private static final String[] INVALID = {
			"   ",
			"\u200b\u200b", // zero-width spaces only
			"\u200d", // a lone joiner
			"\u00a0", // no-break space only
			"\u0301", // a combining mark with nothing to attach to
			"Da\u200bna", // zero-width space inside
			"\u200bDana", // ... at the start
			"Dana\u2060", // word joiner at the end
			"Dana\ufeff", // byte order mark
			"Da\u00adna", // soft hyphen
			"Dana\u200d", // a joiner needs a visible character on both sides
			"\u200dDana",
			"Da\u200d\u200dna",
			"Dana\u202eevil", // right-to-left override
			"Dana\u2066evil\u2069", // bidirectional isolates
			"Da\u200fna", // right-to-left mark
			"Da\u0085na", // C1 control (next line)
			"Da\u009fna", // C1 control
			"Da\nna",
			"Da\u2028na", // line separator
			"Da\u2029na", // paragraph separator
			"x".repeat(101),
			"\ud83d\ude00".repeat(101), // 101 emoji: counted as characters people see, not UTF-16 units
	};

	/** Names people really have. */
	private static final String[] VALID = {
			"Dana",
			"Jos\u00e9 \u00c1lvarez",
			"\u738b\u5c0f\u660e",
			"Dana \"Dee\" O'Neil-Smith Jr.",
			"\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67", // family emoji, joined by U+200D
			"\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645", // Persian, with a zero-width non-joiner
			"\u0928\u092e\u0938\u094d\u200d\u0924\u0947", // Hindi
			"x".repeat(100),
			"\ud83d\ude00".repeat(100), // 100 emoji is 200 UTF-16 units
	};

	@Autowired
	RestTestClient client;

	@Test
	void registrationRejectsInvisibleAndSpoofedNames() {
		for (var name : INVALID) {
			register(name, "invalid-" + EMAILS.incrementAndGet() + "@example.com")
				.expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.errors.displayName").exists();
		}
	}

	@Test
	void renameRejectsInvisibleAndSpoofedNamesAndKeepsTheOldOne() {
		var accessToken = registerAndGetAccessToken();

		for (var name : INVALID) {
			rename(accessToken, name)
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
	void registrationAcceptsRealNames() {
		for (var name : VALID) {
			register(name, "valid-" + EMAILS.incrementAndGet() + "@example.com")
				.expectStatus().isCreated()
				.expectBody()
				.jsonPath("$.user.displayName").isEqualTo(name);
		}
	}

	@Test
	void renameAcceptsRealNames() {
		var accessToken = registerAndGetAccessToken();

		for (var name : VALID) {
			rename(accessToken, name)
				.expectStatus().isOk()
				.expectBody()
				.jsonPath("$.displayName").isEqualTo(name);
		}
	}

	@Test
	void surroundingWhitespaceIsStillRemovedFirst() {
		var accessToken = registerAndGetAccessToken();

		rename(accessToken, "  Dana Scully\t")
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Dana Scully");
	}

	private RestTestClient.ResponseSpec register(String displayName, String email) {
		return client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", "correct horse"))
			.exchange();
	}

	private RestTestClient.ResponseSpec rename(String accessToken, String displayName) {
		return client.patch().uri("/api/users/me")
			.header("Authorization", "Bearer " + accessToken)
			.body(Map.of("displayName", displayName))
			.exchange();
	}

	private String registerAndGetAccessToken() {
		var registration = register("Dana", "rename-" + EMAILS.incrementAndGet() + "@example.com")
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat(registration).isNotBlank();
		return JsonPath.read(registration, "$.accessToken");
	}

}
