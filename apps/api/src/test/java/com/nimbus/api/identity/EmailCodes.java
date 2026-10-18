package com.nimbus.api.identity;

import java.util.Map;

import com.nimbus.api.RecordingMailer;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Lets a test that registers a User go on to use Nimbus: it enters the code from the User's verification email. */
public final class EmailCodes {

	private EmailCodes() {
	}

	/** Verifies the email of the User who just registered with {@code email}, as they would from their inbox. */
	public static void verify(RestTestClient client, String accessToken, String email) {
		client.post().uri("/api/auth/verify-email")
			.header("Authorization", "Bearer " + accessToken)
			.body(Map.of("code", RecordingMailer.lastCodeFor(email)))
			.exchange()
			.expectStatus().isOk();
	}

}
