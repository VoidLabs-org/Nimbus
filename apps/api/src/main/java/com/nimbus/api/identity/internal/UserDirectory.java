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

	private final ProfilePictures pictures;

	UserDirectory(UserRepository users, ProfilePictures pictures) {
		this.users = users;
		this.pictures = pictures;
	}

	@Override
	public Optional<UserSummary> findByEmail(String email) {
		return users.findByEmail(email.strip().toLowerCase(Locale.ROOT)).map(this::summary);
	}

	@Override
	public List<UserSummary> findAllById(Collection<UUID> ids) {
		return users.findAllById(ids).stream().map(this::summary).toList();
	}

	private UserSummary summary(User user) {
		return new UserSummary(user.getId(), user.email(), user.displayName(), pictures.addressOf(user),
				user.emailVerified());
	}

}
