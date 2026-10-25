package com.nimbus.api.storage.internal;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Where the bucket is and how to reach it. The defaults are the MinIO from {@code docker compose}.
 *
 * @param endpoint the S3 API address (STORAGE_ENDPOINT), e.g. {@code https://<account>.r2.cloudflarestorage.com}
 * @param region the bucket's region (STORAGE_REGION): {@code auto} for R2, anything for MinIO
 * @param bucket the bucket's name (STORAGE_BUCKET)
 * @param accessKey the access key id (STORAGE_ACCESS_KEY)
 * @param secretKey the secret access key (STORAGE_SECRET_KEY)
 */
@ConfigurationProperties("nimbus.storage")
record StorageProperties(@DefaultValue("http://localhost:9000") String endpoint, @DefaultValue("us-east-1") String region,
		@DefaultValue("nimbus") String bucket, @DefaultValue("") String accessKey,
		@DefaultValue("") String secretKey) {

	/** Whitespace pasted into .env is dropped. */
	StorageProperties {
		endpoint = endpoint.strip();
		region = region.isBlank() ? "us-east-1" : region.strip();
		bucket = bucket.strip();
		accessKey = accessKey.strip();
		secretKey = secretKey.strip();
	}

}
