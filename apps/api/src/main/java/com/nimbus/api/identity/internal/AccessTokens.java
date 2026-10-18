package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/** Issues short-lived access tokens: HS256 JWTs whose subject is the User id. */
@Component
class AccessTokens {

	static final String SESSION_CLAIM = "sid";

	/** True when the User's email was verified at issue time. Absent or false means "look it up". */
	static final String VERIFIED_CLAIM = "ev";

	private final JwtEncoder encoder;

	private final AuthProperties properties;

	private final Clock clock;

	AccessTokens(JwtEncoder encoder, AuthProperties properties, Clock clock) {
		this.encoder = encoder;
		this.properties = properties;
		this.clock = clock;
	}

	/** The {@code sid} claim names the session the token was issued in, so a request can tell which one it is. */
	String issueFor(User user, UUID sessionId) {
		var now = clock.instant();
		var claims = JwtClaimsSet.builder()
			.subject(user.getId().toString())
			.claim(SESSION_CLAIM, sessionId.toString())
			.claim(VERIFIED_CLAIM, user.emailVerified())
			.issuedAt(now)
			.expiresAt(now.plus(properties.accessTokenTtl()))
			.build();
		var header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}

}
