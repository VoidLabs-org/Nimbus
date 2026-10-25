/**
 * Keeps uploaded files (objects) in the object store, Cloudflare R2 through the S3 API. Knows nothing about what the
 * files are for.
 *
 * <p>Public types in this package are the module's API. Sub-packages are internal to the module.
 */
@ApplicationModule
package com.nimbus.api.storage;

import org.springframework.modulith.ApplicationModule;
