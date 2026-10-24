package com.nimbus.api.identity.internal;

import java.util.Base64;
import java.util.Map;
import java.util.Set;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.AndRequestMatcher;
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher;
import org.springframework.security.web.util.matcher.NegatedRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Every request needs a valid access token (Bearer JWT) unless it is listed as public here.
 * The API is stateless, so Spring's CSRF tokens and HTTP sessions are off.
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectProvider<ClientRegistrationRepository> providers,
			ObjectProvider<OAuth2AuthorizedClientRepository> authorizedClients, OAuthLoginHandler oauthLogin,
			AuthProperties properties, UserRepository users) {
		http.csrf(csrf -> csrf.disable())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(requests -> requests
				.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/refresh",
					"/api/auth/logout", "/api/auth/password-reset", "/api/auth/password-reset/confirm",
					"/api/auth/two-step")
				.permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/providers").permitAll()
				.requestMatchers("/error").permitAll()
				.anyRequest().authenticated())
			.oauth2ResourceServer(server -> server.jwt(Customizer.withDefaults()))
			.addFilterAfter(new EmailVerifiedGate(users), BearerTokenAuthenticationFilter.class);
		// A browser page load (a GET or HEAD that names text/html) of an API address without a token goes to the
		// web app's sign-in page. "Accept: */*" (fetch, curl) is not a page load, and neither is a write: those get
		// a 401. Registered before oauth2Login's own entry point, which would otherwise win for them.
		RequestMatcher read = request -> HttpMethod.GET.matches(request.getMethod())
				|| HttpMethod.HEAD.matches(request.getMethod());
		var pageLoad = new MediaTypeRequestMatcher(MediaType.TEXT_HTML);
		pageLoad.setIgnoredMediaTypes(Set.of(MediaType.ALL));
		http.exceptionHandling(handling -> handling
			.defaultAuthenticationEntryPointFor(new WebLoginEntryPoint(properties.publicUrl()),
					new AndRequestMatcher(read, pageLoad))
			.defaultAuthenticationEntryPointFor(new BearerTokenAuthenticationEntryPoint(),
					new NegatedRequestMatcher(read)));
		// Only the OAuth handshake keeps an HTTP session (the state and PKCE values of the login in progress, and the
		// page to return to).
		// OAuthLoginHandler drops it as soon as the handshake ends.
		if (providers.getIfAvailable() != null) {
			http.oauth2Login(login -> login
				// What is left for oauth2Login's entry point (a GET asking for plain text or an image) also goes
				// to the web app, not to a generated page on the API host.
				.loginPage(properties.publicUrl() + "/login")
				.authorizationEndpoint(endpoint -> endpoint.baseUri(ReturnPathAuthorizationRequestResolver.BASE_URI)
					.authorizationRequestResolver(new ReturnPathAuthorizationRequestResolver(providers.getObject())))
				.redirectionEndpoint(endpoint -> endpoint.baseUri("/api/auth/oauth2/callback/*"))
				.authorizedClientRepository(authorizedClients.getObject())
				.userInfoEndpoint(endpoint -> endpoint.userService(new GithubUserService()))
				.successHandler(oauthLogin)
				.failureHandler(oauthLogin));
		}
		return http.build();
	}

	/**
	 * Argon2id, not bcrypt: bcrypt only hashes the first 72 bytes and we allow passwords up to 128 characters.
	 * Hashes are stored with an {@code {argon2}} prefix, so the algorithm can change later without breaking them.
	 */
	@Bean
	PasswordEncoder passwordEncoder() {
		return new DelegatingPasswordEncoder("argon2",
				Map.of("argon2", Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()));
	}

	@Bean
	SecretKey jwtKey(AuthProperties properties) {
		var hint = "JWT_SECRET must be base64 of at least 32 bytes; generate one with: openssl rand -base64 32";
		byte[] bytes;
		try {
			bytes = Base64.getDecoder().decode(properties.jwtSecret().strip());
		}
		catch (IllegalArgumentException e) {
			throw new IllegalStateException(hint, e);
		}
		if (bytes.length < 32) {
			throw new IllegalStateException(hint);
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey) {
		return NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
	}

}
