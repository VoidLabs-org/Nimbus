package com.nimbus.api.identity.internal;

import java.util.Base64;
import java.util.Map;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Every request needs a valid access token (Bearer JWT) unless it is listed as public here.
 * The API is stateless, so Spring's CSRF tokens and HTTP sessions are off.
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) {
		http.csrf(csrf -> csrf.disable())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(requests -> requests
				.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
				.requestMatchers("/error").permitAll()
				.anyRequest().authenticated())
			.oauth2ResourceServer(server -> server.jwt(Customizer.withDefaults()));
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
