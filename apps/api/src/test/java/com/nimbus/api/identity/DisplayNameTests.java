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

	private static final int BLACK_FLAG = 0x1F3F4;

	private static final int TAG_CANCEL = 0xE007F;

	/** The flag of England: a black flag, the tag letters "gbeng" and the cancel tag. */
	private static final String ENGLAND = cp(BLACK_FLAG, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, TAG_CANCEL);

	/** Stricter cases, written as numbers so no invisible character sits in this file. */
	private static final String[] ALSO_INVALID = {
			"Dana" + cp(0xE0041), // a tag character outside a flag: invisible text
			cp(BLACK_FLAG) + cp(0xE0068, 0xE0069, 0xE0064, 0xE0064, 0xE0065, 0xE006E, 0xE0020, 0xE006D, 0xE0065,
					TAG_CANCEL), // a flag carrying a hidden message
			"Da" + cp(0x034F) + "na", // combining grapheme joiner: invisible
			"Da" + cp(0xFE0F) + "na", // emoji variation selector after a letter
			"Da" + cp(0xFE00) + "na",
			"D" + cp(0x0301).repeat(90), // a stack of combining marks drawing over the rows around it
			cp(0x0301) + "Dana", // a mark with nothing to attach to
			"Dana " + cp(0x0301) + "x",
			String.valueOf((char) 0xD800), // a lone surrogate
			"Dana" + cp(0xE000), // a private-use character
	};

	private static final String[] ALSO_VALID = {
			"Dana " + ENGLAND,
			"I " + cp(0x2764, 0xFE0F) + " you", // a heart with the emoji variation selector
			cp('1', 0xFE0F, 0x20E3), // a keycap
			cp(0x845B, 0xE0100), // a Han character with an ideographic variation selector
			"Nguye" + cp(0x0302, 0x0303) + "n", // letters with two marks stacked
			cp(0x1F44D, 0x1F3FD) + " Dana", // a thumbs up with a skin tone
	};

	@Autowired
	RestTestClient client;

	@Test
	void stricterCasesAreRejectedAtRegistrationAndRename() {
		var accessToken = registerAndGetAccessToken();

		for (var name : ALSO_INVALID) {
			register(name, "stricter-" + EMAILS.incrementAndGet() + "@example.com")
				.expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.errors.displayName").exists();
			rename(accessToken, name)
				.expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.errors.displayName").exists();
		}
	}

	@Test
	void flagsMarksAndSelectorsThatAreVisibleAreAcceptedAtRegistrationAndRename() {
		var accessToken = registerAndGetAccessToken();

		for (var name : ALSO_VALID) {
			register(name, "visible-" + EMAILS.incrementAndGet() + "@example.com")
				.expectStatus().isCreated()
				.expectBody()
				.jsonPath("$.user.displayName").isEqualTo(name);
			rename(accessToken, name)
				.expectStatus().isOk()
				.expectBody()
				.jsonPath("$.displayName").isEqualTo(name);
		}
	}

	// A no-break space is not "whitespace" to Java's strip(), but it is padding all the same.
	@Test
	void paddingWithNoBreakSpacesIsRemovedLikeOtherWhitespace() {
		var accessToken = registerAndGetAccessToken();

		rename(accessToken, cp(0xA0, 0xA0, 0x2007) + "Admin" + cp(0x202F, 0x3000))
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.displayName").isEqualTo("Admin");
	}

	private static String cp(int... codePoints) {
		return new String(codePoints, 0, codePoints.length);
	}

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
		var email = "rename-" + EMAILS.incrementAndGet() + "@example.com";
		var registration = register("Dana", email)
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat(registration).isNotBlank();
		String token = JsonPath.read(registration, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return token;
	}

}
