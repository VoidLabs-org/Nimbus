package com.nimbus.api.identity.internal;

import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Sign-in settings.
 *
 * @param jwtSecret base64-encoded HS256 key of at least 32 bytes (JWT_SECRET in .env)
 * @param accessTokenTtl how long an access token stays valid
 * @param sessionIdleTimeout how long a session survives without a refresh (sliding)
 * @param sessionMaxAge how long a session lasts at most after sign-in, however active
 * @param failedSignInsPerEmail failed sign-ins allowed for one email within {@code limitWindow}
 * @param signInsPerAddress failed sign-ins allowed from one IP address within {@code limitWindow}, across all
 * emails
 * @param registrationsPerAddress registration attempts allowed from one IP address within {@code limitWindow}
 * @param refreshesPerAddress refresh attempts allowed from one IP address within {@code limitWindow}
 * @param limitWindow the sliding window all limits count over
 * @param publicUrl the origin browsers use to reach Nimbus (PUBLIC_URL), without a trailing slash; Google and the
 * post-login redirects use it instead of the request's host, which behind a proxy is the API's own
 */
@ConfigurationProperties("nimbus.auth")
@Validated
record AuthProperties(
		@NotBlank(message = "set JWT_SECRET in apps/api/.env (see .env.example)") String jwtSecret,
		@DefaultValue("15m") Duration accessTokenTtl,
		@DefaultValue("30d") Duration sessionIdleTimeout,
		@DefaultValue("90d") Duration sessionMaxAge,
		@DefaultValue("5") @Positive int failedSignInsPerEmail,
		@DefaultValue("20") @Positive int signInsPerAddress,
		@DefaultValue("10") @Positive int registrationsPerAddress,
		@DefaultValue("60") @Positive int refreshesPerAddress,
		@DefaultValue("15m") Duration limitWindow,
		@DefaultValue("http://localhost:3000") String publicUrl) {

	AuthProperties {
		publicUrl = publicUrl.strip().replaceAll("/+$", "");
	}

}
