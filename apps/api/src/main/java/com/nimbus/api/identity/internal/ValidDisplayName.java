package com.nimbus.api.identity.internal;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/**
 * The value is a valid display name; see {@link DisplayName} for the rule. Put it on a name that is already
 * normalized ({@link DisplayName#normalize}). The message says which part of the rule failed.
 */
@Documented
@Constraint(validatedBy = ValidDisplayName.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
@interface ValidDisplayName {

	String message() default "is not a valid display name";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<ValidDisplayName, String> {

		@Override
		public boolean isValid(String name, ConstraintValidatorContext context) {
			var problem = DisplayName.problem(name);
			if (problem.isEmpty()) {
				return true;
			}
			context.disableDefaultConstraintViolation();
			context.buildConstraintViolationWithTemplate(problem.get().replace("{", "\\{")).addConstraintViolation();
			return false;
		}

	}

}
