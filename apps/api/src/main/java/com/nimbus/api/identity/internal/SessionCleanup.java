package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.IntervalTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Deletes sessions that ended more than {@code nimbus.auth.session-retention} ago, so the {@code sessions} and
 * {@code refresh_tokens} tables stop growing. It runs on a fixed delay ({@code nimbus.auth.session-cleanup-interval}).
 * Meant for a single API instance: two running it at once only repeat the same deletes.
 */
@Component
@EnableScheduling
class SessionCleanup implements SchedulingConfigurer {

	private static final Logger log = LoggerFactory.getLogger(SessionCleanup.class);

	private final SessionRepository sessions;

	private final AuthProperties properties;

	private final Clock clock;

	SessionCleanup(SessionRepository sessions, AuthProperties properties, Clock clock) {
		this.sessions = sessions;
		this.properties = properties;
		this.clock = clock;
	}

	@Override
	public void configureTasks(ScheduledTaskRegistrar registrar) {
		var interval = properties.sessionCleanupInterval();
		registrar.addFixedDelayTask(new IntervalTask(this::runAndLog, interval, interval));
	}

	private void runAndLog() {
		try {
			run();
		}
		catch (RuntimeException e) {
			// The next run tries again; one failure must not stop the schedule.
			log.warn("Cleaning up ended sessions failed", e);
		}
	}

	/** @return how many sessions were deleted */
	@Transactional
	int run() {
		// Microseconds, like the stored times (see Sessions), so a session ending exactly at the cutoff compares right.
		var cutoff = clock.instant().truncatedTo(ChronoUnit.MICROS).minus(properties.sessionRetention());
		var removed = sessions.deleteEndedBefore(cutoff);
		log.info("Removed {} ended sessions (ended before {})", removed, cutoff);
		return removed;
	}

}
