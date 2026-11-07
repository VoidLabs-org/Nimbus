package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

import com.nimbus.api.TestcontainersConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The migration that stores each project's default Status, run on projects made before it: the first To do Status in
 * order, where new Issues started until then. It runs in a schema of its own, so the app's schema is left alone.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StatusDefaultBackfillTests {

	@Autowired
	DataSource dataSource;

	@Autowired
	JdbcClient jdbc;

	@Test
	void existingProjectsDefaultToTheirFirstToDoStatus() {
		var schema = "default_backfill_" + UUID.randomUUID().toString().replace("-", "");
		try {
			backfill(schema);
		}
		finally {
			jdbc.sql("DROP SCHEMA IF EXISTS " + schema + " CASCADE").update();
		}
	}

	private void backfill(String schema) {
		migrate(schema, "30");
		var one = project(schema, "ONE");
		var two = project(schema, "TWO");
		// ONE: a To do Status that is not first overall, ahead of another.
		status(schema, one, "In progress", "IN_PROGRESS", 0);
		status(schema, one, "Triage", "TODO", 1);
		status(schema, one, "To do", "TODO", 2);
		status(schema, one, "Done", "DONE", 3);
		status(schema, two, "To do", "TODO", 0);
		status(schema, two, "Done", "DONE", 1);

		migrate(schema, "31");

		assertThat(defaults(schema, one)).containsExactly("Triage");
		assertThat(defaults(schema, two)).containsExactly("To do");
		// The database refuses a second default in a project, and a default that isn't To do.
		org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
				() -> jdbc.sql("UPDATE " + schema + ".issue_statuses SET is_default = TRUE WHERE project_id = :p AND name = 'To do'")
					.param("p", one).update());
		org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
				() -> jdbc.sql("UPDATE " + schema + ".issue_statuses SET is_default = TRUE WHERE project_id = :p AND name = 'Done'")
					.param("p", two).update());
	}

	private void migrate(String schema, String target) {
		Flyway.configure().dataSource(dataSource).schemas(schema).locations("classpath:db/migration").target(target)
			.load().migrate();
	}

	private UUID project(String schema, String key) {
		var id = UUID.randomUUID();
		jdbc.sql("INSERT INTO " + schema + ".projects (id, key, name, created_at) VALUES (:id, :key, :key, now())")
			.param("id", id).param("key", key).update();
		return id;
	}

	private void status(String schema, UUID project, String name, String category, int position) {
		jdbc.sql("INSERT INTO " + schema + ".issue_statuses (id, project_id, name, category, position) VALUES (:id, :p, :name, :category, :position)")
			.param("id", UUID.randomUUID()).param("p", project).param("name", name).param("category", category)
			.param("position", position).update();
	}

	private List<String> defaults(String schema, UUID project) {
		return jdbc.sql("SELECT name FROM " + schema + ".issue_statuses WHERE project_id = :p AND is_default")
			.param("p", project).query(String.class).list();
	}

}
