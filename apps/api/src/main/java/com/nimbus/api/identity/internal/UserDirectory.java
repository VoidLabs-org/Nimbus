package com.nimbus.api.identity.internal;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(readOnly = true)
class UserDirectory implements Users {

	private final UserRepository users;

	UserDirectory(UserRepository users) {
		this.users = users;
	}

	@Override
	public Optional<UserSummary> findByEmail(String email) {
		return users.findByEmail(email.strip().toLowerCase(Locale.ROOT)).map(UserDirectory::summary);
	}

	@Override
	public List<UserSummary> findAllById(Collection<UUID> ids) {
		return users.findAllById(ids).stream().map(UserDirectory::summary).toList();
	}

	private static UserSummary summary(User user) {
		return new UserSummary(user.getId(), user.email(), user.displayName(), user.avatarUrl(), user.emailVerified());
	}

}
