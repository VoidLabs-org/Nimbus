package com.nimbus.api.storage.internal;

import java.util.Optional;

import com.nimbus.api.storage.ObjectStore;
import com.nimbus.api.storage.StorageException;
import com.nimbus.api.storage.StoredObject;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/** The bucket through the S3 API, which R2, MinIO and S3 all speak. */
class S3ObjectStore implements ObjectStore {

	private final S3Client s3;

	private final String bucket;

	S3ObjectStore(S3Client s3, String bucket) {
		this.s3 = s3;
		this.bucket = bucket;
	}

	@Override
	public void store(String key, byte[] content, String contentType) {
		try {
			s3.putObject(put -> put.bucket(bucket).key(key).contentType(contentType),
					RequestBody.fromBytes(content));
		}
		catch (SdkException e) {
			throw new StorageException("Could not store " + key, e);
		}
	}

	@Override
	public Optional<StoredObject> read(String key) {
		try {
			var object = s3.getObject(get -> get.bucket(bucket).key(key));
			var response = object.response();
			var length = response.contentLength() == null ? -1 : response.contentLength();
			return Optional.of(new StoredObject(response.contentType(), length, object));
		}
		catch (NoSuchKeyException e) {
			return Optional.empty();
		}
		catch (SdkException e) {
			throw new StorageException("Could not read " + key, e);
		}
	}

	@Override
	public void delete(String key) {
		try {
			// S3 answers a delete of a missing key with success too.
			s3.deleteObject(delete -> delete.bucket(bucket).key(key));
		}
		catch (SdkException e) {
			throw new StorageException("Could not delete " + key, e);
		}
	}

}
