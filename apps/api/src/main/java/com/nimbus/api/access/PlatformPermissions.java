package com.nimbus.api.access;

import java.util.UUID;

/** Answers whether a User holds a platform permission, through their platform roles or Everyone. */
public interface PlatformPermissions {

	/** {@code false} for keys that are not platform permissions in the catalog. */
	boolean holds(UUID userId, String permission);

	/** Throws {@link PermissionDeniedException} unless the User holds the platform permission. */
	default void require(UUID userId, String permission) {
		if (!holds(userId, permission)) {
			throw new PermissionDeniedException(permission);
		}
	}

}
