package com.nimbus.api.notifications.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Deletes expired Notifications in small committed batches, nightly at 03:00 UTC. */
@Component
class NotificationCleanup {
	private static final Logger log = LoggerFactory.getLogger(NotificationCleanup.class);
	private final JdbcClient jdbc;
	private final Clock clock;

	NotificationCleanup(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Scheduled(cron = "${nimbus.notifications.cleanup-cron:0 0 3 * * *}", zone = "UTC")
	void run() {
		var cutoff = clock.instant().truncatedTo(ChronoUnit.MICROS).minus(Duration.ofDays(90));
		int total = 0;
		int removed;
		do {
			removed = jdbc.sql("DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE created_at < :cutoff LIMIT 1000)")
				.param("cutoff", Timestamp.from(cutoff)).update();
			total += removed;
		} while (removed == 1000);
		log.info("Removed {} Notifications older than 90 days", total);
	}
}
