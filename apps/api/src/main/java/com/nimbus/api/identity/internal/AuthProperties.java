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
 * @param sessionRetention how long after a session ended (revoked, or past {@code sessionMaxAge}) its rows are
 * kept before the cleanup job deletes them
 * @param sessionCleanupInterval how long the cleanup job waits after a run before the next one
 * @param sessionCleanupBatchSize how many ended sessions one delete removes; a larger backlog is cleared in
 * several deletes, so no transaction holds many rows locked
 * @param failedSignInsPerEmail failed sign-ins allowed for one email within {@code limitWindow}
 * @param signInsPerAddress failed sign-ins allowed from one IP address within {@code limitWindow}, across all
 * emails
 * @param registrationsPerAddress registration attempts allowed from one IP address within {@code limitWindow}
 * @param refreshesPerAddress refresh attempts allowed from one IP address within {@code limitWindow}
 * @param passwordResetRequestsPerAddress forgot-password requests allowed from one IP address within {@code limitWindow}
 * @param passwordResetsPerAddress password reset attempts (code and new password) allowed from one IP address within
 * {@code limitWindow}
 * @param emailSendInterval the least time between two emails to one address (a Verification code or a Reset code)
 * @param emailSendsPerHour emails allowed to one address within an hour
 * @param limitWindow the sliding window the other limits count over
 * @param linkRecentSignIn how recently the Session must have started for the User to connect a provider
 * @param wrongSignInCodesPerHour wrong Sign-in codes allowed for one User within an hour, across pending sign-ins and
 * setup; past it every code check for that User is refused until the hour clears
 * @param twoStepSecret base64 of at least 32 bytes (TWO_STEP_SECRET in .env); encrypts authenticator keys and keys
 * the Recovery code hashes, so losing it means every User sets up Two-step verification again
 * @param publicUrl the origin browsers use to reach Nimbus (PUBLIC_URL), without a trailing slash; the OAuth providers (Google, GitHub) and the
 * post-login redirects use it instead of the request's host, which behind a proxy is the API's own
 */
@ConfigurationProperties("nimbus.auth")
@Validated
record AuthProperties(
		@NotBlank(message = "set JWT_SECRET in apps/api/.env (see .env.example)") String jwtSecret,
		@DefaultValue("15m") Duration accessTokenTtl,
		@DefaultValue("30d") Duration sessionIdleTimeout,
		@DefaultValue("90d") Duration sessionMaxAge,
		@DefaultValue("7d") Duration sessionRetention,
		@DefaultValue("1h") Duration sessionCleanupInterval,
		@DefaultValue("1000") @Positive int sessionCleanupBatchSize,
		@DefaultValue("5") @Positive int failedSignInsPerEmail,
		@DefaultValue("20") @Positive int signInsPerAddress,
		@DefaultValue("10") @Positive int registrationsPerAddress,
		@DefaultValue("60") @Positive int refreshesPerAddress,
		@DefaultValue("10") @Positive int passwordResetRequestsPerAddress,
		@DefaultValue("10") @Positive int passwordResetsPerAddress,
		@DefaultValue("60s") Duration emailSendInterval,
		@DefaultValue("5") @Positive int emailSendsPerHour,
		@DefaultValue("15m") Duration limitWindow,
		@DefaultValue("10m") Duration linkRecentSignIn,
		@DefaultValue("10") @Positive int wrongSignInCodesPerHour,
		@NotBlank(message = "set TWO_STEP_SECRET in apps/api/.env (see .env.example)") String twoStepSecret,
		@DefaultValue("http://localhost:3000") String publicUrl) {

	AuthProperties {
		if (emailSendInterval.isZero() || emailSendInterval.isNegative()) {
			throw new IllegalArgumentException("nimbus.auth.email-send-interval must be positive");
		}
		publicUrl = publicUrl.strip().replaceAll("/+$", "");
	}

}
