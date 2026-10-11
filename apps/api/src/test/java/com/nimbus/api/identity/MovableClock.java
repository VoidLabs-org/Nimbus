package com.nimbus.api.identity;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Lets a test move time forward instead of waiting. */
class MovableClock extends Clock {

	private volatile Instant now;

	MovableClock(Instant start) {
		this.now = start;
	}

	void advance(Duration duration) {
		now = now.plus(duration);
	}

	@Override
	public Instant instant() {
		return now;
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return this;
	}

	/** Import it to replace the application's clock with a {@link MovableClock}. */
	@TestConfiguration(proxyBeanMethods = false)
	static class Configuration {

		@Bean
		@Primary
		MovableClock movableClock() {
			return new MovableClock(Instant.now());
		}

	}

}
