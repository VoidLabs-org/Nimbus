package com.nimbus.api.access;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Requires the signed-in User to hold a platform permission before a controller method runs, {@code 403}
 * otherwise. Only for platform permissions: project permissions need the project, so services ask {@code access}
 * explicitly.
 */
@Documented
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
public @interface Authorize {

	/** The platform permission's key. */
	String value();

}
