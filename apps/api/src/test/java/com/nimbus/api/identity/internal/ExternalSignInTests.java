package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.UserRegistered;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;

/**
 * The rules for who a provider's profile signs in as. Google itself is not faked over HTTP: the profile is what
 * the provider would have said, handed to the same entry point the OAuth success handler uses.
 */
@Import({ TestcontainersConfiguration.class, ExternalSignInTests.Recorder.class })
@SpringBootTest
class ExternalSignInTests {

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Recorder recorder;

	@Autowired
	Registration registration;

	@Autowired
	Sessions sessions;

	@Autowired
	SignIn signIn;

	@Autowired
	UserRepository users;

	@Test
	void aFirstTimeVerifiedUserIsCreatedLinkedAndAnnounced() {
		var user = externalSignIn.signIn(google("g-ada", "ada@example.com", true, "Ada Lovelace", "https://img/ada"));

		assertThat(user.email()).isEqualTo("ada@example.com");
		assertThat(user.displayName()).isEqualTo("Ada Lovelace");
		assertThat(user.avatarUrl()).isEqualTo("https://img/ada");
		assertThat(user.emailVerified()).isTrue();
		assertThat(user.passwordHash()).isNull();
		assertThat(recorder.registered).filteredOn(event -> event.email().equals("ada@example.com"))
			.singleElement()
			.satisfies(event -> {
				assertThat(event.userId()).isEqualTo(user.getId());
				assertThat(event.displayName()).isEqualTo("Ada Lovelace");
			});
	}

	@Test
	void aReturningUserIsSignedInByTheirLinkAndGetsTheNewAvatarButKeepsTheirName() {
		var first = externalSignIn.signIn(google("g-bea", "bea@example.com", true, "Bea", "https://img/bea-1"));
		var renamed = users.findById(first.getId()).orElseThrow();
		renamed.rename("Bea Renamed");
		users.save(renamed);

		// Google now reports another name, another avatar and even another email: the link still decides.
		var again = externalSignIn
			.signIn(google("g-bea", "bea.new@example.com", true, "Someone Else", "https://img/bea-2"));

		assertThat(again.getId()).isEqualTo(first.getId());
		assertThat(again.displayName()).isEqualTo("Bea Renamed");
		assertThat(again.avatarUrl()).isEqualTo("https://img/bea-2");
		assertThat(again.email()).isEqualTo("bea@example.com");
		assertThat(recorder.registered).filteredOn(event -> event.userId().equals(first.getId())).hasSize(1);
	}

	@Test
	void aProfileWithoutAVerifiedEmailIsRefusedAndCreatesNoUser() {
		assertThatThrownBy(() -> externalSignIn.signIn(google("g-cy", "cy@example.com", false, "Cy", null)))
			.isInstanceOf(ExternalSignIn.EmailUnverifiedException.class);

		assertThat(users.existsByEmail("cy@example.com")).isFalse();
	}

	@Test
	void aVerifiedUserWithAPasswordIsLinkedAndKeepsPasswordAndSessions() {
		var existing = registration.create("Dee", "dee@example.com", "correct horse");
		existing.verifyEmail();
		users.save(existing);
		var token = sessions.start(existing);

		var signedIn = externalSignIn.signIn(google("g-dee", "dee@example.com", true, "Dee G", "https://img/dee"));

		assertThat(signedIn.getId()).isEqualTo(existing.getId());
		assertThat(signedIn.displayName()).isEqualTo("Dee");
		assertThat(signedIn.avatarUrl()).isEqualTo("https://img/dee");
		assertThat(signIn.signIn("dee@example.com", "correct horse", "client-dee").getId()).isEqualTo(existing.getId());
		assertThat(sessions.refresh(token.value(), "client-dee").user().getId()).isEqualTo(existing.getId());
		assertThat(externalSignIn.signIn(google("g-dee", "other@example.com", true, null, null)).getId())
			.isEqualTo(existing.getId());
		assertThat(recorder.registered).filteredOn(event -> event.userId().equals(existing.getId())).hasSize(1);
	}

	@Test
	void anUnverifiedPasswordUserIsLinkedVerifiedAndLosesPasswordAndEverySession() {
		var squatted = registration.create("Eli", "eli@example.com", "squatter pass");
		var firstBrowser = sessions.start(squatted);
		var secondBrowser = sessions.start(squatted);
		assertThat(squatted.emailVerified()).isFalse();

		var signedIn = externalSignIn.signIn(google("g-eli", "eli@example.com", true, "Eli Real", "https://img/eli"));

		assertThat(signedIn.getId()).isEqualTo(squatted.getId());
		assertThat(signedIn.emailVerified()).isTrue();
		assertThat(signedIn.passwordHash()).isNull();
		assertThatThrownBy(() -> signIn.signIn("eli@example.com", "squatter pass", "client-eli"))
			.isInstanceOf(SignIn.InvalidCredentialsException.class);
		assertThatThrownBy(() -> sessions.refresh(firstBrowser.value(), "client-eli"))
			.isInstanceOf(Sessions.InvalidRefreshTokenException.class);
		assertThatThrownBy(() -> sessions.refresh(secondBrowser.value(), "client-eli"))
			.isInstanceOf(Sessions.InvalidRefreshTokenException.class);
		assertThat(externalSignIn.signIn(google("g-eli", "eli@example.com", true, "Eli Real", null)).getId())
			.isEqualTo(squatted.getId());
		assertThat(recorder.registered).filteredOn(event -> event.userId().equals(squatted.getId())).hasSize(1);
	}

	@Test
	void aLongNameIsCutBetweenCharactersNeverInsideAnEmoji() {
		var emoji = new String(Character.toChars(0x1F600));
		var name = "a".repeat(99) + emoji + "bcd";

		var user = externalSignIn.signIn(google("g-fay", "fay@example.com", true, name, null));

		assertThat(user.displayName()).isEqualTo("a".repeat(99) + emoji);
	}

	private static ExternalProfile google(String id, String email, boolean verified, String name, String avatar) {
		return new ExternalProfile("google", id, email, verified, name, avatar);
	}

	@TestConfiguration
	static class Recorder {

		final List<UserRegistered> registered = new CopyOnWriteArrayList<>();

		@EventListener
		void on(UserRegistered event) {
			registered.add(event);
		}

	}

}
