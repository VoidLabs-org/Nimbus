package com.nimbus.api.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.test.ApplicationModuleTest;

/** The store against MinIO in a container, which speaks the same S3 API as R2. */
@ApplicationModuleTest
@Import(TestcontainersConfiguration.class)
class ObjectStoreTests {

	@Autowired
	ObjectStore store;

	@Test
	void anObjectStoredUnderAKeyReadsBackWithItsTypeUntilDeleted() throws IOException {
		var key = "tests/" + UUID.randomUUID();
		var content = "hello, bucket".getBytes(StandardCharsets.UTF_8);

		store.store(key, content, "text/plain");

		try (var object = store.read(key).orElseThrow()) {
			assertThat(object.contentType()).isEqualTo("text/plain");
			assertThat(object.length()).isEqualTo(content.length);
			assertThat(object.content().readAllBytes()).isEqualTo(content);
		}

		store.delete(key);
		assertThat(store.read(key)).isEmpty();
	}

	@Test
	void storingUnderTheSameKeyReplacesTheObject() throws IOException {
		var key = "tests/" + UUID.randomUUID();
		store.store(key, new byte[] { 1, 2, 3 }, "application/octet-stream");

		store.store(key, new byte[] { 4 }, "image/jpeg");

		try (var object = store.read(key).orElseThrow()) {
			assertThat(object.contentType()).isEqualTo("image/jpeg");
			assertThat(object.content().readAllBytes()).containsExactly(4);
		}
	}

	@Test
	void aMissingKeyReadsAsNothingAndDeletesWithoutError() {
		var key = "tests/" + UUID.randomUUID();

		assertThat(store.read(key)).isEmpty();
		store.delete(key);
	}

}
