package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.identity.UserRegistered;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;

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
	LinkedIdentities linkedIdentities;

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

	@Autowired
	JdbcTemplate jdbc;

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
	void aNewUsersLinkRemembersTheAccountNameTheProviderGave() {
		var user = externalSignIn.signIn(google("g-nia", "nia@example.com", true, "Nia", null));

		assertThat(linkedIdentities.listFor(user.getId())).singleElement().satisfies(identity -> {
			assertThat(identity.provider()).isEqualTo("google");
			assertThat(identity.accountName()).isEqualTo("nia@example.com");
			assertThat(identity.connectedAt()).isNotNull();
		});
	}

	@Test
	void linkingAnExistingUserRemembersTheAccountNameToo() {
		var existing = registration.create("Ola", "ola@example.com", "correct horse");
		existing.verifyEmail();
		users.save(existing);

		var user = externalSignIn.signIn(new ExternalProfile("github", "gh-ola", "ola@example.com", true, "Ola", null,
				"ola-codes"));

		assertThat(linkedIdentities.listFor(user.getId())).extracting(LinkedIdentities.LinkedIdentityView::accountName)
			.containsExactly("ola-codes");
	}

	@Test
	void everyLaterSignInRefreshesTheAccountNameSoItFollowsARename() {
		var user = externalSignIn.signIn(new ExternalProfile("github", "gh-pia", "pia@example.com", true, "Pia", null,
				"pia-old"));

		externalSignIn.signIn(new ExternalProfile("github", "gh-pia", "pia@example.com", true, "Pia", null, "pia-new"));

		assertThat(linkedIdentities.listFor(user.getId())).extracting(LinkedIdentities.LinkedIdentityView::accountName)
			.containsExactly("pia-new");
	}

	@Test
	void aSignInThatCarriesNoAccountNameKeepsTheOneWeHave() {
		var user = externalSignIn.signIn(google("g-quin", "quin@example.com", true, "Quin", null));

		externalSignIn.signIn(new ExternalProfile("google", "g-quin", null, true, "Quin", null, null));

		assertThat(linkedIdentities.listFor(user.getId())).extracting(LinkedIdentities.LinkedIdentityView::accountName)
			.containsExactly("quin@example.com");
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
		var token = sessions.start(existing, null);

		var signedIn = externalSignIn.signIn(google("g-dee", "dee@example.com", true, "Dee G", "https://img/dee"));

		assertThat(signedIn.getId()).isEqualTo(existing.getId());
		assertThat(signedIn.displayName()).isEqualTo("Dee");
		assertThat(signedIn.avatarUrl()).isEqualTo("https://img/dee");
		assertThat(signIn.signIn("dee@example.com", "correct horse", "client-dee").getId()).isEqualTo(existing.getId());
		assertThat(sessions.refresh(token.value(), "client-dee").user().getId()).isEqualTo(existing.getId());
		assertThat(externalSignIn.signIn(google("g-dee", "other@example.com", true, null, null)).getId())
			.isEqualTo(existing.getId());
		assertThat(recorder.registered).filteredOn(event -> event.userId().equals(existing.getId())).hasSize(1);
		assertThat(recorder.verified).filteredOn(event -> event.userId().equals(existing.getId())).isEmpty();
	}

	@Test
	void anUnverifiedPasswordUserIsLinkedVerifiedAndLosesPasswordAndEverySession() {
		var squatted = registration.create("Eli", "eli@example.com", "squatter pass");
		var firstBrowser = sessions.start(squatted, null);
		var secondBrowser = sessions.start(squatted, null);
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
		// Announced once, when the provider proved the address; the second sign-in above changes nothing.
		assertThat(recorder.verified).filteredOn(event -> event.userId().equals(squatted.getId()))
			.singleElement()
			.satisfies(event -> assertThat(event.email()).isEqualTo("eli@example.com"));
	}

	@Test
	void aDisconnectedProviderIsRefusedOnTheUsersEmailAndLeavesPasswordAndSessionsAlone() {
		var user = registration.create("Dis", "dis@example.com", "correct horse");
		var session = sessions.start(user, null);
		jdbc.update("INSERT INTO disconnected_providers (user_id, provider, disconnected_at) VALUES (?, 'google', now())",
				user.getId());

		assertThatThrownBy(() -> externalSignIn.signIn(google("g-dis", "dis@example.com", true, "Dis", null)))
			.isInstanceOf(ExternalSignIn.ProviderDisconnectedException.class);

		assertThat(users.findById(user.getId()).orElseThrow().passwordHash()).isNotNull();
		assertThat(sessions.refresh(session.value(), "client-dis").user().getId()).isEqualTo(user.getId());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM linked_identities WHERE user_id = ?", Integer.class,
				user.getId())).isZero();
	}

	@Test
	void withTheMarkTheSameProviderAccountOnAnotherEmailFollowsTheNormalRules() {
		var user = externalSignIn.signIn(google("g-mark", "mark@example.com", true, "Mark", null));
		jdbc.update("DELETE FROM linked_identities WHERE user_id = ?", user.getId());
		jdbc.update("INSERT INTO disconnected_providers (user_id, provider, disconnected_at) VALUES (?, 'google', now())",
				user.getId());

		var other = externalSignIn.signIn(google("g-mark", "mark.other@example.com", true, "Mark", null));

		assertThat(other.getId()).isNotEqualTo(user.getId());
		assertThat(other.email()).isEqualTo("mark.other@example.com");
	}

	@Test
	void connectingLinksTheProviderAccountEvenWhenItsEmailIsDifferent() {
		var user = registration.create("Con", "con@example.com", "correct horse");
		var session = sessions.start(user, null);

		var linked = externalSignIn.connect(user.getId(), google("g-con", "con.work@example.com", true, "Con", null));

		assertThat(linked).isTrue();
		assertThat(linkedIdentities.listFor(user.getId())).singleElement()
			.satisfies(identity -> assertThat(identity.accountName()).isEqualTo("con.work@example.com"));
		// Nothing about the User changes: not the email, not the verification state, not the password, not a session.
		var after = users.findById(user.getId()).orElseThrow();
		assertThat(after.email()).isEqualTo("con@example.com");
		assertThat(after.emailVerified()).isFalse();
		assertThat(after.passwordHash()).isNotNull();
		assertThat(sessions.refresh(session.value(), "client-con").user().getId()).isEqualTo(user.getId());
	}

	@Test
	void connectingAnAccountThatBelongsToAnotherUserIsRefusedAndChangesNothing() {
		var owner = externalSignIn.signIn(google("g-own", "own@example.com", true, "Own", null));
		var other = registration.create("Oth", "oth@example.com", "correct horse");

		assertThatThrownBy(() -> externalSignIn.connect(other.getId(), google("g-own", "own@example.com", true, "Own", null)))
			.isInstanceOf(ExternalSignIn.AlreadyLinkedException.class);

		assertThat(linkedIdentities.listFor(owner.getId())).hasSize(1);
		assertThat(linkedIdentities.listFor(other.getId())).isEmpty();
	}

	@Test
	void connectingAnAccountTheUserAlreadyHasOnlyRefreshesItsName() {
		var user = externalSignIn.signIn(google("g-same", "same@example.com", true, "Same", null));

		var linked = externalSignIn.connect(user.getId(), new ExternalProfile("google", "g-same", "same@example.com",
				true, "Same", null, "renamed@example.com"));

		assertThat(linked).isFalse();
		assertThat(linkedIdentities.listFor(user.getId())).singleElement()
			.satisfies(identity -> assertThat(identity.accountName()).isEqualTo("renamed@example.com"));
	}

	@Test
	void connectingStillNeedsAVerifiedEmailFromTheProvider() {
		var user = registration.create("Unv", "unv@example.com", "correct horse");

		assertThatThrownBy(() -> externalSignIn.connect(user.getId(), google("g-unv", "unv@example.com", false, "Unv", null)))
			.isInstanceOf(ExternalSignIn.EmailUnverifiedException.class);
		assertThat(linkedIdentities.listFor(user.getId())).isEmpty();
	}

	@Test
	void connectingClearsTheMarkSoASignInOnTheUsersEmailWorksAgain() {
		var user = externalSignIn.signIn(google("g-back", "back@example.com", true, "Back", null));
		jdbc.update("DELETE FROM linked_identities WHERE user_id = ?", user.getId());
		jdbc.update("INSERT INTO disconnected_providers (user_id, provider, disconnected_at) VALUES (?, 'google', now())",
				user.getId());
		assertThatThrownBy(() -> externalSignIn.signIn(google("g-back2", "back@example.com", true, "Back", null)))
			.isInstanceOf(ExternalSignIn.ProviderDisconnectedException.class);

		externalSignIn.connect(user.getId(), google("g-back2", "back.other@example.com", true, "Back", null));

		assertThat(jdbc.queryForObject("SELECT count(*) FROM disconnected_providers WHERE user_id = ?", Integer.class,
				user.getId())).isZero();
		jdbc.update("DELETE FROM linked_identities WHERE user_id = ?", user.getId());
		assertThat(externalSignIn.signIn(google("g-back2", "back@example.com", true, "Back", null)).getId())
			.isEqualTo(user.getId());
	}

	@Test
	void aLongNameIsCutBetweenCharactersNeverInsideAnEmoji() {
		var emoji = new String(Character.toChars(0x1F600));
		var name = "a".repeat(99) + emoji + "bcd";

		var user = externalSignIn.signIn(google("g-fay", "fay@example.com", true, name, null));

		assertThat(user.displayName()).isEqualTo("a".repeat(99) + emoji);
	}

	// A provider can't be refused over a name, so the name is made valid instead: the same rule as for a typed one.
	@Test
	void invisibleAndDirectionalCharactersAreDroppedFromAProviderName() {
		var user = externalSignIn.signIn(google("g-gus", "gus@example.com", true, "Gu\u200bs\u202e \u0085Hall\u2028", null));

		assertThat(user.displayName()).isEqualTo("Gus Hall");
	}

	@Test
	void aProviderNameKeepsJoinersBetweenVisibleCharactersButNotStrayOnes() {
		var family = "\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67";

		var user = externalSignIn.signIn(google("g-hal", "hal@example.com", true, "\u200d" + family + "\u200d", null));

		assertThat(user.displayName()).isEqualTo(family);
	}

	@Test
	void aProviderNameWithNothingVisibleFallsBackToTheStartOfTheEmail() {
		var user = externalSignIn.signIn(google("g-ivy", "ivy@example.com", true, "\u200b\u200d \u202e", null));

		assertThat(user.displayName()).isEqualTo("ivy");
	}

	@Test
	void aProviderNameIsCutAtOneHundredCharactersWithoutLeavingAJoinerAtTheEnd() {
		var name = "a".repeat(99) + "\u200d" + "b".repeat(5);

		var user = externalSignIn.signIn(google("g-jo", "jo@example.com", true, name, null));

		// The cut falls right after the joiner, so it is dropped with what followed.
		assertThat(user.displayName()).isEqualTo("a".repeat(99));
	}

	@Test
	void aProviderNameKeepsAFlagButLosesTagCharactersThatCarryHiddenText() {
		var england = cp(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F);
		var hidden = cp(0xE0041, 0xE0042);

		var user = externalSignIn.signIn(google("g-kit", "kit@example.com", true, "Kit " + england + hidden, null));

		assertThat(user.displayName()).isEqualTo("Kit " + england);
	}

	// Cutting between code points could split a skin tone off its emoji or half a flag.
	@Test
	void aProviderNameIsCutBetweenWholeCharactersAsPeopleSeeThem() {
		var thumbsUp = cp(0x1F44D, 0x1F3FD);
		var flag = cp(0x1F1FA, 0x1F1F8);

		var withSkinTone = externalSignIn.signIn(google("g-lee", "lee@example.com", true, "a".repeat(99) + thumbsUp, null));
		var withFlag = externalSignIn.signIn(google("g-max", "max@example.com", true, "b".repeat(99) + flag, null));
		var fits = externalSignIn.signIn(google("g-nat", "nat@example.com", true, "c".repeat(98) + thumbsUp, null));

		assertThat(withSkinTone.displayName()).isEqualTo("a".repeat(99));
		assertThat(withFlag.displayName()).isEqualTo("b".repeat(99));
		assertThat(fits.displayName()).isEqualTo("c".repeat(98) + thumbsUp);
	}

	@Test
	void aProviderNameLosesInvisibleMarksPaddingAndStackedMarks() {
		var name = cp(0xA0, 0xA0) + "Da" + cp(0x034F) + "na" + cp(0x0301).repeat(40) + cp(0x202F);

		var user = externalSignIn.signIn(google("g-oli", "oli@example.com", true, name, null));

		assertThat(user.displayName()).isEqualTo("Dana" + cp(0x0301).repeat(5));
	}

	private static String cp(int... codePoints) {
		return new String(codePoints, 0, codePoints.length);
	}

	private static ExternalProfile google(String id, String email, boolean verified, String name, String avatar) {
		return new ExternalProfile("google", id, email, verified, name, avatar, email);
	}

	@TestConfiguration
	static class Recorder {

		final List<UserRegistered> registered = new CopyOnWriteArrayList<>();

		final List<EmailVerified> verified = new CopyOnWriteArrayList<>();

		@EventListener
		void on(UserRegistered event) {
			registered.add(event);
		}

		@EventListener
		void on(EmailVerified event) {
			verified.add(event);
		}

	}

}
