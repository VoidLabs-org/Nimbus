package com.nimbus.api.mail.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.SocketTimeoutException;
import java.time.Duration;

import com.nimbus.api.mail.Mail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@ExtendWith(OutputCaptureExtension.class)
class BrevoMailerTests {

	private static final Mail MAIL = new Mail("ada@example.com", "Your Nimbus verification code",
			"<p>Your code is <b>482917</b></p>", "Your code is 482917");

	private MockRestServiceServer server;

	private BrevoMailer mailer;

	@BeforeEach
	void setUp() {
		var builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		mailer = new BrevoMailer(builder.build(), new MailProperties("secret-key", "hello@nimbus.dev", "Nimbus",
				Duration.ofSeconds(5), ""));
	}

	@Test
	void postsOurOwnHtmlAndTextToBrevoWithTheApiKey() {
		server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header("api-key", "secret-key"))
			.andExpect(header("Content-Type", MediaType.APPLICATION_JSON_VALUE))
			.andExpect(jsonPath("$.sender.email").value("hello@nimbus.dev"))
			.andExpect(jsonPath("$.sender.name").value("Nimbus"))
			.andExpect(jsonPath("$.to.length()").value(1))
			.andExpect(jsonPath("$.to[0].email").value("ada@example.com"))
			.andExpect(jsonPath("$.subject").value("Your Nimbus verification code"))
			.andExpect(jsonPath("$.htmlContent").value("<p>Your code is <b>482917</b></p>"))
			.andExpect(jsonPath("$.textContent").value("Your code is 482917"))
			.andExpect(jsonPath("$.templateId").doesNotExist())
			.andRespond(withSuccess("{\"messageId\":\"<abc@smtp-relay.mailin.fr>\"}", MediaType.APPLICATION_JSON));

		mailer.send(MAIL);

		server.verify();
	}

	@Test
	void anErrorResponseIsLoggedWithTheReasonAndNotThrown(CapturedOutput output) {
		server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
			.andRespond(withStatus(HttpStatus.UNAUTHORIZED).contentType(MediaType.APPLICATION_JSON)
				.body("{\"code\":\"unauthorized\",\"message\":\"Key not found\"}"));

		assertThatCode(() -> mailer.send(MAIL)).doesNotThrowAnyException();

		assertThat(output).contains("Could not send an email to ada@example.com").contains("401").contains("Key not found");
		assertThat(output).doesNotContain("secret-key");
	}

	@Test
	void aServerErrorIsLoggedAndNotRetried(CapturedOutput output) {
		server.expect(once(), requestTo("https://api.brevo.com/v3/smtp/email")).andRespond(withServerError());

		assertThatCode(() -> mailer.send(MAIL)).doesNotThrowAnyException();

		assertThat(output).contains("Could not send an email").contains("500");
		server.verify();
	}

	@Test
	void aTimeoutIsLoggedAndNotThrown(CapturedOutput output) {
		server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
			.andRespond(request -> {
				throw new SocketTimeoutException("Read timed out");
			});

		assertThatCode(() -> mailer.send(MAIL)).doesNotThrowAnyException();

		assertThat(output).contains("Could not send an email").contains("Read timed out");
	}

	@Test
	void aSuccessfulSendIsQuietAtInfo(CapturedOutput output) {
		server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
			.andRespond(withSuccess("{\"messageId\":\"<abc@smtp-relay.mailin.fr>\"}", MediaType.APPLICATION_JSON));

		mailer.send(MAIL);

		server.verify();
		// The messageId goes to DEBUG, and the recipient is only named when something fails.
		assertThat(output).doesNotContain("Could not send").doesNotContain("abc@smtp-relay").doesNotContain("ada@example.com");
	}

	@Test
	void aMailWithMissingPartsIsLoggedNotThrown(CapturedOutput output) {
		assertThatCode(() -> mailer.send(new Mail("ada@example.com", "Hello", "<p>Hi</p>", null)))
			.doesNotThrowAnyException();

		assertThat(output).contains("Could not send an email to ada@example.com");
	}

	@Test
	void aHugeErrorPageIsCutShort(CapturedOutput output) {
		server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
			.andRespond(withStatus(HttpStatus.BAD_GATEWAY).body("x".repeat(5000)));

		mailer.send(MAIL);

		assertThat(output).contains("502").doesNotContain("x".repeat(600));
	}

}
