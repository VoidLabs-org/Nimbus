package com.nimbus.api.storage;

/** The object store couldn't be reached, or refused the request (wrong keys, missing bucket). */
public class StorageException extends RuntimeException {

	public StorageException(String message, Throwable cause) {
		super(message, cause);
	}

}
