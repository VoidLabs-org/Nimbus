package com.nimbus.api.identity.internal;

/**
 * An email and a password, as far as the rules for them go. Carries {@link ValidEmail} and
 * {@link ValidPassword} so a caller that has no request to validate, like the admin seed, can still check a pair
 * against the same constraints registration uses. The email must already be stripped.
 */
record Credentials(@ValidEmail String email, @ValidPassword String password) {
}
