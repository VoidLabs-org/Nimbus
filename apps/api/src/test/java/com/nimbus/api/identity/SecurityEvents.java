package com.nimbus.api.identity;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.event.EventListener;

/**
 * Collects the Security alert events of the signed-in flows. Requests run on server threads, which Spring's
 * recorded application events don't see, so a test {@code @Import}s this and asks it what it saw about a User.
 */
@TestConfiguration(proxyBeanMethods = false)
public class SecurityEvents {

	private final List<Object> seen = new CopyOnWriteArrayList<>();

	@EventListener
	void on(PasswordChanged event) {
		seen.add(event);
	}

	@EventListener
	void on(LinkedIdentityConnected event) {
		seen.add(event);
	}

	@EventListener
	void on(LinkedIdentityDisconnected event) {
		seen.add(event);
	}

	@EventListener
	void on(OtherSessionsSignedOut event) {
		seen.add(event);
	}

	public <T> List<T> of(Class<T> type, UUID userId) {
		return seen.stream().filter(type::isInstance).map(type::cast).filter(isAbout(userId)).toList();
	}

	private static Predicate<Object> isAbout(UUID userId) {
		return event -> switch (event) {
			case PasswordChanged e -> e.userId().equals(userId);
			case LinkedIdentityConnected e -> e.userId().equals(userId);
			case LinkedIdentityDisconnected e -> e.userId().equals(userId);
			case OtherSessionsSignedOut e -> e.userId().equals(userId);
			default -> false;
		};
	}

}
