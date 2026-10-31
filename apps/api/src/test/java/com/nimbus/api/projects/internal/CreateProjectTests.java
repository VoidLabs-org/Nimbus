package com.nimbus.api.projects.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The rules for a new project's fields, without a server or database. */
class CreateProjectTests {

	private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

	private static Set<ConstraintViolation<ProjectsController.CreateProject>> check(String name) {
		return VALIDATOR.validate(new ProjectsController.CreateProject("ABC", name, null));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "   ", " ", "​", "  ​  ", "\t\n" })
	void aNameWithNothingVisibleInItIsRejected(String name) {
		assertThat(check(name)).extracting(v -> v.getPropertyPath().toString()).containsExactly("name");
	}

	@ParameterizedTest
	@ValueSource(strings = { " Nimbus​", "\tNimbus\n", "  Nimbus  " })
	void invisibleCharactersAroundAnAcceptableNameAreStripped(String name) {
		var request = new ProjectsController.CreateProject("ABC", name, null);

		assertThat(request.name()).isEqualTo("Nimbus");
		assertThat(VALIDATOR.validate(request)).isEmpty();
	}

	@Test
	void invisibleCharactersInsideANameAreKept() {
		// A zero-width joiner holds an emoji sequence together, so only the ends are cleaned.
		var request = new ProjectsController.CreateProject("ABC", "Team 👨‍💻", null);

		assertThat(request.name()).isEqualTo("Team 👨‍💻");
		assertThat(VALIDATOR.validate(request)).isEmpty();
	}

	@Test
	void aNameOfOneHundredCharactersIsAcceptedAndOneMoreIsNot() {
		assertThat(check("x".repeat(100))).isEmpty();
		assertThat(check("x".repeat(101))).hasSize(1);
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "   ", " ", "​", "  ​  ", "\t\r\n" })
	void aDescriptionWithNothingVisibleInItIsNoDescription(String description) {
		var request = new ProjectsController.CreateProject("ABC", "Nimbus", description);

		assertThat(request.description()).isNull();
		assertThat(VALIDATOR.validate(request)).isEmpty();
	}

	@Test
	void aDescriptionIsCleanedAtBothEndsLikeANameButItsLineBreaksAreKept() {
		var request = new ProjectsController.CreateProject("ABC", "Nimbus",
				"  First line\r\nSecond\tline\n​ ");

		assertThat(request.description()).isEqualTo("First line\r\nSecond\tline");
	}

	@Test
	void noDescriptionStaysNone() {
		assertThat(new ProjectsController.CreateProject("ABC", "Nimbus", null).description()).isNull();
	}
}
