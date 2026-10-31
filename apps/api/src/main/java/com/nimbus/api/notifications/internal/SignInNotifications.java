package com.nimbus.api.notifications.internal;

import java.util.LinkedHashMap;

import com.nimbus.api.identity.SignedIn;
import com.nimbus.api.mail.NoticeMail;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

@Component
class SignInNotifications {

	static final String TYPE = "SIGNED_IN";
	private static final String TITLE = "New sign-in to your account";
	private final SecurityAlerts alerts;

	SignInNotifications(SecurityAlerts alerts) {
		this.alerts = alerts;
	}

	@ApplicationModuleListener
	void on(SignedIn event) {
		var snapshot = new LinkedHashMap<String, String>();
		snapshot.put("title", TITLE);
		snapshot.put("deviceLabel", event.deviceLabel());
		var line = "Your Nimbus account was signed in on " + event.deviceLabel() + " on " + NoticeMail.time(event.at()) + ".";
		alerts.deliver(event.userId(), TYPE, TYPE + ":" + event.sessionId(), event.at(), snapshot,
			email -> alerts.standard(email, new SecurityAlerts.Standard(TITLE, TITLE, line,
				"If this wasn't you, review your sessions and change your password.")));
	}
}
