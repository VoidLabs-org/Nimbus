package com.nimbus.api.notifications.internal;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Per-User email switches for Issue Notification types. Only switches that differ from the default are stored. */
@Component
class NotificationSettings {

	/** The Notification types whose email can be switched; Security alerts are always emailed. */
	enum IssueType {
		ISSUE_ASSIGNED(true), ISSUE_UNASSIGNED(true), ISSUE_STATUS_CHANGED(true), ISSUE_EDITED(false), ISSUE_DELETED(true);

		final boolean emailByDefault;

		IssueType(boolean emailByDefault) {
			this.emailByDefault = emailByDefault;
		}

		static IssueType parse(String type) {
			return Arrays.stream(values()).filter(t -> t.name().equals(type)).findFirst()
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown or fixed Notification type"));
		}
	}

	record Setting(String type, boolean email) {
	}

	private final JdbcClient jdbc;

	NotificationSettings(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<Setting> list(UUID userId) {
		Map<String, Boolean> saved = new HashMap<>();
		for (var setting : jdbc.sql("SELECT type, email FROM notification_settings WHERE user_id = :user")
			.param("user", userId).query((rs, n) -> new Setting(rs.getString("type"), rs.getBoolean("email"))).list()) {
			saved.put(setting.type(), setting.email());
		}
		return Arrays.stream(IssueType.values())
			.map(t -> new Setting(t.name(), saved.getOrDefault(t.name(), t.emailByDefault))).toList();
	}

	void save(UUID userId, IssueType type, boolean email) {
		if (email == type.emailByDefault) {
			jdbc.sql("DELETE FROM notification_settings WHERE user_id = :user AND type = :type")
				.param("user", userId).param("type", type.name()).update();
			return;
		}
		jdbc.sql("""
			INSERT INTO notification_settings(user_id, type, email) VALUES (:user, :type, :email)
			ON CONFLICT (user_id, type) DO UPDATE SET email = EXCLUDED.email
			""").param("user", userId).param("type", type.name()).param("email", email).update();
	}
}
