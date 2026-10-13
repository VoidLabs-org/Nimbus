package com.nimbus.api.identity.internal;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The one definition of an email a User can register with: not blank, an email address, at most 254 characters.
 * Registration and the admin seed both use it, so they accept the same addresses. Put it on an email that is
 * already stripped of surrounding whitespace.
 */
@Documented
@Constraint(validatedBy = {})
@NotBlank
@Email
@Size(max = ValidEmail.MAX_LENGTH)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@interface ValidEmail {

	int MAX_LENGTH = 254;

	String message() default "is not a valid email address";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
