package com.nimbus.api.storage;

import java.io.IOException;
import java.io.InputStream;

/**
 * An object read from the store, streamed rather than loaded into memory. Close it once read.
 *
 * @param contentType the type it was stored with; null when the store doesn't say
 * @param length its size in bytes; -1 when the store doesn't say
 * @param content its bytes, straight from the store
 */
public record StoredObject(String contentType, long length, InputStream content) implements AutoCloseable {

	@Override
	public void close() throws IOException {
		content.close();
	}

}
