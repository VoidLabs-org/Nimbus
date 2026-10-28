package com.nimbus.api.notifications.internal;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.nimbus.api.identity.LinkedIdentityConnected;
import com.nimbus.api.identity.LinkedIdentityDisconnected;
import com.nimbus.api.identity.OtherSessionsSignedOut;
import com.nimbus.api.identity.PasswordChanged;
import com.nimbus.api.mail.NoticeMail;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Turns the account changes a User makes (password, sign-in providers, signing out other devices) into Security
 * alerts. Their dedupe key holds the User and the instant, so a redelivered event is one Notification while two
 * changes are two.
 */
@Component
class SecurityChangeNotifications {

	static final String PASSWORD_CHANGED = "PASSWORD_CHANGED";
	static final String LINKED_IDENTITY_CONNECTED = "LINKED_IDENTITY_CONNECTED";
	static final String LINKED_IDENTITY_DISCONNECTED = "LINKED_IDENTITY_DISCONNECTED";
	static final String OTHER_SESSIONS_SIGNED_OUT = "OTHER_SESSIONS_SIGNED_OUT";

	private static final Map<String, String> PROVIDERS = Map.of("google", "Google", "github", "GitHub");

	private final SecurityAlerts alerts;

	SecurityChangeNotifications(SecurityAlerts alerts) {
		this.alerts = alerts;
	}

	@ApplicationModuleListener
	void on(PasswordChanged event) {
		var title = event.reset() ? "Password reset" : "Password changed";
		var line = "On " + NoticeMail.time(event.at()) + ", your Nimbus password was "
			+ (event.reset() ? "reset with a Reset code." : "changed.");
		alerts.deliver(event.userId(), PASSWORD_CHANGED, key(PASSWORD_CHANGED, event.userId(), event.at()), event.at(),
			snapshot(title, "If this wasn't you, reset it now."),
			email -> alerts.standard(email, new SecurityAlerts.Standard(
				event.reset() ? "Your Nimbus password was reset" : "Your Nimbus password was changed", title, line,
				"If this wasn't you, reset your password now and sign out your other devices.")));
	}

	@ApplicationModuleListener
	void on(LinkedIdentityConnected event) {
		var provider = providerName(event.provider());
		var detail = (event.accountName() == null ? "It" : event.accountName())
			+ " can now be used to sign in. If this wasn't you, review your sign-in methods.";
		alerts.deliver(event.userId(), LINKED_IDENTITY_CONNECTED,
			key(LINKED_IDENTITY_CONNECTED, event.userId(), event.at()), event.at(),
			snapshot(provider + " connected", detail),
			email -> ProviderMail.connected(email, provider, event.at(), alerts.securityUrl(), alerts.logo()));
	}

	@ApplicationModuleListener
	void on(LinkedIdentityDisconnected event) {
		var provider = providerName(event.provider());
		var detail = "It can no longer be used to sign in. If this wasn't you, review your sign-in methods.";
		alerts.deliver(event.userId(), LINKED_IDENTITY_DISCONNECTED,
			key(LINKED_IDENTITY_DISCONNECTED, event.userId(), event.at()), event.at(),
			snapshot(provider + " disconnected", detail),
			email -> ProviderMail.disconnected(email, provider, event.at(), alerts.securityUrl(), alerts.logo()));
	}

	@ApplicationModuleListener
	void on(OtherSessionsSignedOut event) {
		var title = "Signed out of other devices";
		var line = "On " + NoticeMail.time(event.at()) + ", every device except one was signed out of your Nimbus account.";
		var help = "If this wasn't you, change your password now.";
		alerts.deliver(event.userId(), OTHER_SESSIONS_SIGNED_OUT,
			key(OTHER_SESSIONS_SIGNED_OUT, event.userId(), event.at()), event.at(), snapshot(title, help),
			email -> alerts.standard(email,
				new SecurityAlerts.Standard("You signed out of your other devices", title, line, help)));
	}

	private static String providerName(String provider) {
		return PROVIDERS.getOrDefault(provider, provider);
	}

	private static String key(String type, UUID userId, Instant at) {
		return type + ":" + userId + ":" + at;
	}

	private static Map<String, String> snapshot(String title, String detail) {
		var snapshot = new LinkedHashMap<String, String>();
		snapshot.put("title", title);
		snapshot.put("detail", detail);
		return snapshot;
	}
}
