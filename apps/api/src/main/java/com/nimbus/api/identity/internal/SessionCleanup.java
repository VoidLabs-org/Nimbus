package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.stereotype.Component;

/**
 * Deletes sessions that ended more than {@code nimbus.auth.session-retention} ago, so the {@code sessions} and
 * {@code refresh_tokens} tables stop growing. It runs on a fixed delay ({@code nimbus.auth.session-cleanup-interval}).
 * Each delete takes at most {@code nimbus.auth.session-cleanup-batch-size} sessions and commits on its own, so a
 * large backlog never becomes one long transaction. Meant for a single API instance: two running it at once only
 * repeat the same deletes. It also deletes expired remembered browsers ({@link RememberedBrowsers}). Scheduling
 * itself is switched on in {@code ApiApplication}.
 */
@Component
class SessionCleanup implements SchedulingConfigurer {

	private static final Logger log = LoggerFactory.getLogger(SessionCleanup.class);

	private final SessionRepository sessions;

	private final AuthProperties properties;

	private final Clock clock;

	private final RememberedBrowsers rememberedBrowsers;

	SessionCleanup(SessionRepository sessions, AuthProperties properties, Clock clock,
			RememberedBrowsers rememberedBrowsers) {
		this.rememberedBrowsers = rememberedBrowsers;
		this.sessions = sessions;
		this.properties = properties;
		this.clock = clock;
	}

	@Override
	public void configureTasks(ScheduledTaskRegistrar registrar) {
		var interval = properties.sessionCleanupInterval();
		registrar.addFixedDelayTask(new FixedDelayTask(this::runAndLog, interval, interval));
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
	int run() {
		// Microseconds, like the stored times (see Sessions), so a session ending exactly at the cutoff compares right.
		var cutoff = clock.instant().truncatedTo(ChronoUnit.MICROS).minus(properties.sessionRetention());
		var batchSize = properties.sessionCleanupBatchSize();
		var removed = 0;
		int batch;
		do {
			batch = sessions.deleteEndedBefore(cutoff, batchSize);
			removed += batch;
		}
		while (batch == batchSize);
		log.info("Removed {} ended sessions (ended before {})", removed, cutoff);
		// Few rows (one per ticked browser, for 30 days), so one delete is enough.
		log.info("Removed {} expired remembered browsers", rememberedBrowsers.deleteExpired());
		return removed;
	}

}
