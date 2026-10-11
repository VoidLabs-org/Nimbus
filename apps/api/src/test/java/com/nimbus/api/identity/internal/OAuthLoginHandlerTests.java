package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.core.authority.AuthorityUtils;

/**
 * What the browser gets back after Google redirects to us: where it is sent, and the refresh cookie that lets
 * the web app finish signing in. The real Google handshake is checked by hand.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OAuthLoginHandlerTests {

	@Autowired
	OAuthLoginHandler handler;

	@Autowired
	Sessions sessions;

	@Test
	void successSetsARefreshCookieThatWorksAndRedirectsWithoutAnyTokenInTheUrl() throws Exception {
		var request = new MockHttpServletRequest();
		var oauthSession = new MockHttpSession();
		request.setSession(oauthSession);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(request, response, google(recorded("verified-user")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/auth/callback");
		var setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
		assertThat(setCookie).startsWith("refresh_token=").contains("HttpOnly").contains("Secure")
			.contains("SameSite=Strict").contains("Path=/api/auth");
		var token = setCookie.substring("refresh_token=".length(), setCookie.indexOf(';'));
		assertThat(sessions.refresh(token, "client-google").user().email()).isEqualTo("ada.lovelace@example.com");
		assertThat(oauthSession.isInvalid()).as("the handshake session ends with the handshake").isTrue();
	}

	@Test
	void anUnverifiedEmailRedirectsToLoginWithTheCodeAndSetsNoCookie() throws Exception {
		var response = new MockHttpServletResponse();

		handler.onAuthenticationSuccess(new MockHttpServletRequest(), response,
				google(recorded("unverified-user")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=email_unverified&provider=google");
		assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
	}

	@Test
	void theUserDecliningAtTheProviderRedirectsToLoginAsCancelled() throws Exception {
		var request = new MockHttpServletRequest();
		request.setRequestURI("/api/auth/oauth2/callback/github");
		var oauthSession = new MockHttpSession();
		request.setSession(oauthSession);
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(request, response,
				new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=cancelled&provider=github");
		assertThat(oauthSession.isInvalid()).isTrue();
	}

	@Test
	void anyOtherFailureRedirectsToLoginAsFailed() throws Exception {
		var response = new MockHttpServletResponse();

		handler.onAuthenticationFailure(new MockHttpServletRequest(), response,
				new OAuth2AuthenticationException(new OAuth2Error("invalid_token_response")));
		assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=failed");

		var other = new MockHttpServletResponse();
		handler.onAuthenticationFailure(new MockHttpServletRequest(), other, new AuthenticationException("boom") {
		});
		assertThat(other.getRedirectedUrl()).isEqualTo("http://localhost:3000/login?error=failed");
	}

	private static OAuth2AuthenticationToken google(Map<String, Object> claims) {
		var user = new DefaultOAuth2User(AuthorityUtils.createAuthorityList("OIDC_USER"), claims, "sub");
		return new OAuth2AuthenticationToken(user, List.of(), "google");
	}

	private static Map<String, Object> recorded(String name) throws IOException {
		try (var json = OAuthLoginHandlerTests.class.getResourceAsStream("/google/" + name + ".json")) {
			return JsonPath.parse(json).read("$");
		}
	}

}
