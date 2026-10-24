package com.nimbus.api;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("pgvector/pgvector:pg16")
			.asCompatibleSubstituteFor("postgres"));
	}

	// A fresh signing key per run, so no secret lives in a tracked file.
	@Bean
	DynamicPropertyRegistrar jwtSecret() {
		var key = new byte[32];
		new SecureRandom().nextBytes(key);
		var secret = Base64.getEncoder().encodeToString(key);
		return registry -> registry.add("nimbus.auth.jwt-secret", () -> secret);
	}

	@Bean
	DynamicPropertyRegistrar twoStepSecret() {
		var key = new byte[32];
		new SecureRandom().nextBytes(key);
		var secret = Base64.getEncoder().encodeToString(key);
		return registry -> registry.add("nimbus.auth.two-step-secret", () -> secret);
	}

}
