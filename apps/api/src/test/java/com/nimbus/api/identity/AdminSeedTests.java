package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/** The seed runs at startup, before any test method, so a listener records what it publishes. */
@Import({ TestcontainersConfiguration.class, AdminSeedTests.Recorder.class })
@ApplicationModuleTest
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=Root@Example.com", "nimbus.admin.password=seeded password" })
class AdminSeedTests {

	@Autowired
	RestTestClient client;

	@Autowired
	Recorder recorder;

	@Test
	void configuredAdminIsCreatedAtStartupAndAnnounced() {
		client.post().uri("/api/auth/login")
			.body(Map.of("email", "root@example.com", "password", "seeded password"))
			.exchange()
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$.user.email").isEqualTo("root@example.com");

		assertThat(recorder.registered).filteredOn(event -> event.email().equals("root@example.com")).hasSize(1);
	}

	@TestConfiguration
	static class Recorder {

		final List<UserRegistered> registered = new CopyOnWriteArrayList<>();

		@EventListener
		void on(UserRegistered event) {
			registered.add(event);
		}

	}

}
