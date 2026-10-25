package com.nimbus.api.storage.internal;

import java.net.URI;
import java.time.Duration;

import com.nimbus.api.storage.ObjectStore;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

/** Builds the S3 client from {@link StorageProperties}. Nothing is checked at startup; a wrong key fails the first call. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(StorageProperties.class)
class StorageConfiguration {

	@Bean(destroyMethod = "close")
	S3Client storageS3Client(StorageProperties properties) {
		if (properties.accessKey().isEmpty() || properties.secretKey().isEmpty()) {
			throw new IllegalStateException(
					"Set STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY in apps/api/.env (see .env.example)");
		}
		return S3Client.builder()
			// The JDK's HTTP client; the SDK's Apache one is left out of the build (see build.gradle.kts).
			.httpClientBuilder(UrlConnectionHttpClient.builder())
			.endpointOverride(URI.create(properties.endpoint()))
			.region(Region.of(properties.region()))
			.credentialsProvider(StaticCredentialsProvider
				.create(AwsBasicCredentials.create(properties.accessKey(), properties.secretKey())))
			// Bucket in the path, not the host name: MinIO needs it, and R2 accepts it.
			.forcePathStyle(true)
			// Only the checksums S3 requires, which every S3-compatible store understands.
			.requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
			.responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
			.overrideConfiguration(config -> config.apiCallTimeout(Duration.ofSeconds(20)))
			.build();
	}

	@Bean
	ObjectStore objectStore(S3Client storageS3Client, StorageProperties properties) {
		return new S3ObjectStore(storageS3Client, properties.bucket());
	}

}
