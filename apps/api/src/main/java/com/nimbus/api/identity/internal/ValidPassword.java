package com.nimbus.api.identity.internal;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The one definition of a password a User can set: 8 to 128 characters, no composition rules, kept exactly as
 * typed. Registration, changing a password and the admin seed all use it.
 */
@Documented
@Constraint(validatedBy = {})
@NotNull
@Size(min = ValidPassword.MIN_LENGTH, max = ValidPassword.MAX_LENGTH)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@interface ValidPassword {

	int MIN_LENGTH = 8;

	int MAX_LENGTH = 128;

	String message() default "is not a valid password";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
