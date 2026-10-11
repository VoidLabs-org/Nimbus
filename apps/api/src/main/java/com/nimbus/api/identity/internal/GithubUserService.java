package com.nimbus.api.identity.internal;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.RequestEntity;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * Loads the signed-in GitHub user: Spring's default {@code GET /user}, plus {@code GET /user/emails}, which needs
 * the {@code user:email} scope. The list is added to the attributes for {@link GithubProfiles}. The provider's
 * access token is used only for these two calls and then dropped ({@link NoStoredProviderTokens}).
 */
class GithubUserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

	private static final URI EMAILS_URL = URI.create("https://api.github.com/user/emails");

	private static final ParameterizedTypeReference<List<Map<String, Object>>> EMAIL_LIST = new ParameterizedTypeReference<>() {
	};

	private final OAuth2UserService<OAuth2UserRequest, OAuth2User> profile = new DefaultOAuth2UserService();

	private final RestTemplate http = new RestTemplate();

	@Override
	public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
		var user = profile.loadUser(request);
		var attributes = new HashMap<>(user.getAttributes());
		attributes.put(GithubProfiles.EMAILS_ATTRIBUTE, emails(request.getAccessToken().getTokenValue()));
		var nameAttribute = request.getClientRegistration()
			.getProviderDetails()
			.getUserInfoEndpoint()
			.getUserNameAttributeName();
		return new DefaultOAuth2User(user.getAuthorities(), attributes, nameAttribute);
	}

	private List<Map<String, Object>> emails(String accessToken) {
		var request = RequestEntity.get(EMAILS_URL)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.accept(MediaType.parseMediaType("application/vnd.github+json"))
			.build();
		try {
			var response = http.exchange(EMAILS_URL, HttpMethod.GET, request, EMAIL_LIST);
			return response.getBody() == null ? List.of() : response.getBody();
		}
		catch (RestClientException e) {
			throw new OAuth2AuthenticationException(
					new OAuth2Error("email_lookup_failed", "Could not read the GitHub account's emails", null), e);
		}
	}

}
