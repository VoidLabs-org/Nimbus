package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/** A new Session, excluding the Session that creates the User. Contains no credentials. */
public record SignedIn(UUID userId, UUID sessionId, String deviceLabel, Instant at) {
}
