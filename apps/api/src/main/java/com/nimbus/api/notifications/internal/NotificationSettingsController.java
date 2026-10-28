package com.nimbus.api.notifications.internal;

import java.util.List;

import com.nimbus.api.identity.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users/me/notification-settings")
class NotificationSettingsController {

	private final CurrentUser user;
	private final NotificationSettings settings;

	NotificationSettingsController(CurrentUser user, NotificationSettings settings) {
		this.user = user;
		this.settings = settings;
	}

	record SwitchRequest(Boolean email) {
	}

	@GetMapping
	List<NotificationSettings.Setting> list() {
		return settings.list(user.id());
	}

	@PutMapping("/{type}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void save(@PathVariable String type, @RequestBody SwitchRequest request) {
		var issueType = NotificationSettings.IssueType.parse(type);
		if (request.email() == null) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email is required");
		}
		settings.save(user.id(), issueType, request.email());
	}
}
