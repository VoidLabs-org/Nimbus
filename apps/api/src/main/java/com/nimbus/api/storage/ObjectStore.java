package com.nimbus.api.storage;

import java.util.Optional;

/**
 * Stores, reads and deletes objects by key in the bucket. Callers choose the keys, and should make them unguessable
 * when the object will be served without sign-in. A failure to reach the store is thrown as
 * {@link StorageException}.
 */
public interface ObjectStore {

	/** Stores {@code content} under {@code key}, replacing any object already there. */
	void store(String key, byte[] content, String contentType);

	/**
	 * The object under {@code key}, or empty when there is none. The caller must close it, which releases the
	 * connection to the store.
	 */
	Optional<StoredObject> read(String key);

	/** Deletes the object under {@code key}; nothing happens when there is none. */
	void delete(String key);

}
