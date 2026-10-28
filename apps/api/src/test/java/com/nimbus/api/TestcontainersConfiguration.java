package com.nimbus.api;

import java.net.URI;
import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	public static final String BUCKET = "nimbus-test";

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("pgvector/pgvector:pg16")
			.asCompatibleSubstituteFor("postgres"));
	}

	/**
	 * Stands in for R2, one for the whole test run: every cached test context sharing it keeps Docker from running a
	 * MinIO next to each context's Postgres. Ryuk removes it when the run ends. MinIO no longer publishes images on
	 * Docker Hub; this is Chainguard's, as in docker-compose.yml.
	 */
	private static final MinIOContainer MINIO = new MinIOContainer(DockerImageName
		.parse("chainguard/minio@sha256:73297936408b731668ca0e835ac9add1a35cb6026a125c2f0cd476d9ef48222c")
		.asCompatibleSubstituteFor("minio/minio"));

	/** Points the storage module at the shared MinIO, starting it and creating the bucket the first time. */
	@Bean
	DynamicPropertyRegistrar storageProperties() {
		startMinio();
		return registry -> {
			registry.add("nimbus.storage.endpoint", MINIO::getS3URL);
			registry.add("nimbus.storage.region", () -> "us-east-1");
			registry.add("nimbus.storage.bucket", () -> BUCKET);
			registry.add("nimbus.storage.access-key", MINIO::getUserName);
			registry.add("nimbus.storage.secret-key", MINIO::getPassword);
		};
	}

	private static synchronized void startMinio() {
		if (MINIO.isRunning()) {
			return;
		}
		MINIO.start();
		try (var s3 = S3Client.builder()
			.endpointOverride(URI.create(MINIO.getS3URL()))
			.region(Region.US_EAST_1)
			.credentialsProvider(StaticCredentialsProvider
				.create(AwsBasicCredentials.create(MINIO.getUserName(), MINIO.getPassword())))
			.forcePathStyle(true)
			.build()) {
			s3.createBucket(create -> create.bucket(BUCKET));
		}
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
