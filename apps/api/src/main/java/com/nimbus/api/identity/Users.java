package com.nimbus.api.identity;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Looks Users up for other modules, which never read identity's tables themselves. */
public interface Users {

	/** The User with this email, in any case and with surrounding whitespace ignored. */
	Optional<UserSummary> findByEmail(String email);

	/** The Users with these ids; ids of Users that don't exist are left out. */
	List<UserSummary> findAllById(Collection<UUID> ids);

}
