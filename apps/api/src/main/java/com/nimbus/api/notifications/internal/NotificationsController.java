package com.nimbus.api.notifications.internal;

import com.nimbus.api.identity.CurrentUser;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
class NotificationsController {

	private final CurrentUser user;
	private final NotificationInbox inbox;
	private final Clock clock;

	NotificationsController(CurrentUser user, NotificationInbox inbox, Clock clock) {
		this.user = user;
		this.inbox = inbox;
		this.clock = clock;
	}

	@GetMapping
	NotificationInbox.Page list(@RequestParam(required = false) String before, @RequestParam(defaultValue = "20") int limit) {
		return inbox.list(user.id(), before, limit);
	}

	@GetMapping("/unread-count")
	Map<String, Long> unreadCount() {
		return Map.of("count", inbox.unreadCount(user.id()));
	}

	@PostMapping("/{id}/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void read(@PathVariable UUID id) {
		inbox.read(user.id(), id, clock.instant());
	}

	@PostMapping("/read-all")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void readAll() {
		inbox.readAll(user.id(), clock.instant());
	}
}
