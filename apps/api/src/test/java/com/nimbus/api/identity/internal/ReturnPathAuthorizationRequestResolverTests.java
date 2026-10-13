package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

/**
 * Starting "Continue with ..." from {@code /login?returnTo=<page>}: the page is kept in the handshake's session for
 * the way back, and never sent to the provider.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ReturnPathAuthorizationRequestResolverTests {

	@Autowired
	ClientRegistrationRepository registrations;

	@Test
	void theReturnPathIsKeptInTheHandshakeSessionAndNotSentToTheProvider() {
		var request = start("google", "/projects/42?tab=board#top");

		var authorization = new ReturnPathAuthorizationRequestResolver(registrations).resolve(request);

		assertThat(authorization).isNotNull();
		assertThat(authorization.getAuthorizationRequestUri()).doesNotContain("returnTo").doesNotContain("projects");
		assertThat(ReturnPath.recall(request)).contains("/projects/42?tab=board#top");
	}

	@ParameterizedTest
	@ValueSource(strings = { "https://evil.example.com", "//evil.example.com", "/\\evil.example.com",
			"/\t/evil.example.com", "/\n/evil.example.com", "evil.example.com", "/", "" })
	void aPathThatCouldLeaveTheAppOrGoesHomeIsNotKept(String returnTo) {
		var request = start("github", returnTo);

		var authorization = new ReturnPathAuthorizationRequestResolver(registrations).resolve(request);

		assertThat(authorization).isNotNull();
		assertThat(ReturnPath.recall(request)).isEmpty();
	}

	@Test
	void withoutAReturnPathTheHandshakeStartsAsBefore() {
		var request = start("google", null);

		var authorization = new ReturnPathAuthorizationRequestResolver(registrations).resolve(request);

		assertThat(authorization).isNotNull();
		assertThat(ReturnPath.recall(request)).isEmpty();
	}

	@ParameterizedTest
	@ValueSource(strings = { "//evil.example.com", "" })
	void startingAgainWithoutAUsablePathForgetsTheEarlierOne(String returnTo) {
		var first = start("google", "/projects/42");
		new ReturnPathAuthorizationRequestResolver(registrations).resolve(first);

		var again = start("google", returnTo);
		again.setSession(first.getSession());
		new ReturnPathAuthorizationRequestResolver(registrations).resolve(again);
		assertThat(ReturnPath.recall(again)).isEmpty();

		var plain = start("github", null);
		plain.setSession(first.getSession());
		new ReturnPathAuthorizationRequestResolver(registrations).resolve(plain);
		assertThat(ReturnPath.recall(plain)).isEmpty();
	}

	private static MockHttpServletRequest start(String provider, String returnTo) {
		var request = new MockHttpServletRequest("GET", "/api/auth/oauth2/" + provider);
		request.setServletPath("/api/auth/oauth2/" + provider);
		if (returnTo != null) {
			request.setParameter("returnTo", returnTo);
		}
		return request;
	}

}
