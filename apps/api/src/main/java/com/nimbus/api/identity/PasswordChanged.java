package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User's password changes, in the same transaction as the change: they change it or set a first
 * one on the Security page, or reset it with a Reset code. Carries no password or code.
 *
 * @param userId the User's id
 * @param at when it changed
 * @param reset whether it was a reset with a Reset code (forgot password) and not a change while signed in
 */
public record PasswordChanged(UUID userId, Instant at, boolean reset) {
}
