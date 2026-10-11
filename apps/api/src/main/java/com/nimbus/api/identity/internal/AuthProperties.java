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
 * @param failedSignInsPerEmail failed sign-ins allowed for one email within {@code limitWindow}
 * @param signInsPerAddress failed sign-ins allowed from one IP address within {@code limitWindow}, across all
 * emails
 * @param registrationsPerAddress registration attempts allowed from one IP address within {@code limitWindow}
 * @param limitWindow the sliding window both limits count over
 */
@ConfigurationProperties("nimbus.auth")
@Validated
record AuthProperties(
		@NotBlank(message = "set JWT_SECRET in apps/api/.env (see .env.example)") String jwtSecret,
		@DefaultValue("15m") Duration accessTokenTtl,
		@DefaultValue("5") @Positive int failedSignInsPerEmail,
		@DefaultValue("20") @Positive int signInsPerAddress,
		@DefaultValue("10") @Positive int registrationsPerAddress,
		@DefaultValue("15m") Duration limitWindow) {
}
