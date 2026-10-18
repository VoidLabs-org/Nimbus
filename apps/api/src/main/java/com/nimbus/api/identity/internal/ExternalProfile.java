package com.nimbus.api.identity.internal;

/**
 * What a sign-in provider says about the person who just signed in, in the same shape for every provider.
 *
 * @param provider which provider vouches for this profile, e.g. {@code google}
 * @param providerUserId the provider's stable id for the person; unlike the email, it never changes
 * @param email lower-cased
 * @param emailVerified whether the provider says the person owns the email
 * @param name the person's name at the provider, or null
 * @param avatarUrl the person's picture at the provider, or null
 * @param accountName what the person knows the account as, shown on the Security page: the Google email or the
 * GitHub username, or null when the provider gave nothing to show
 */
record ExternalProfile(String provider, String providerUserId, String email, boolean emailVerified, String name,
		String avatarUrl, String accountName) {
}
