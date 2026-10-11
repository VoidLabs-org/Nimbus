package com.nimbus.api.identity.internal;

import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Sign-in settings.
 *
 * @param jwtSecret base64-encoded HS256 key of at least 32 bytes (JWT_SECRET in .env)
 * @param accessTokenTtl how long an access token stays valid
 */
@ConfigurationProperties("nimbus.auth")
@Validated
record AuthProperties(
		@NotBlank(message = "set JWT_SECRET in apps/api/.env (see .env.example)") String jwtSecret,
		@DefaultValue("15m") Duration accessTokenTtl) {
}
