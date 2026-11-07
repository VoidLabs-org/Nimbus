package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
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
 * The migration that adds Ranks, run on Issues made before it: each project keeps the order its Board showed, most
 * recently updated first. It runs in a schema of its own, so the app's schema is left alone.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class IssueRankBackfillTests {

	@Autowired
	DataSource dataSource;

	@Autowired
	JdbcClient jdbc;

	@Test
	void existingIssuesAreRankedInTheOrderTheBoardShowedThem() {
		var schema = "rank_backfill_" + UUID.randomUUID().toString().replace("-", "");
		migrate(schema, "29");

		var user = UUID.randomUUID();
		jdbc.sql("INSERT INTO " + schema + ".users (id, email, display_name, created_at) VALUES (:id, :email, 'Dana', now())")
			.param("id", user).param("email", user + "@example.com").update();
		var one = project(schema, "ONE");
		var two = project(schema, "TWO");
		var base = Instant.parse("2026-11-01T10:00:00Z");
		// ONE: #2 updated last, then #3 and #1 updated at the same moment (the higher number first), then #4.
		issue(schema, one, user, 1, base.plusSeconds(20));
		issue(schema, one, user, 2, base.plusSeconds(30));
		issue(schema, one, user, 3, base.plusSeconds(20));
		issue(schema, one, user, 4, base.plusSeconds(10));
		// TWO is ranked on its own.
		issue(schema, two, user, 1, base.plusSeconds(5));
		issue(schema, two, user, 2, base.plusSeconds(1));

		migrate(schema, "30");

		assertThat(numbersInRankOrder(schema, one)).containsExactly(2, 3, 1, 4);
		assertThat(numbersInRankOrder(schema, two)).containsExactly(1, 2);
		assertThat(jdbc.sql("SELECT rank FROM " + schema + ".issues WHERE project_id = :p ORDER BY rank")
			.param("p", one).query(String.class).list()).containsExactly("a0", "a1", "a2", "a3");
	}

	private void migrate(String schema, String target) {
		Flyway.configure().dataSource(dataSource).schemas(schema).locations("classpath:db/migration").target(target)
			.load().migrate();
	}

	private UUID project(String schema, String key) {
		var id = UUID.randomUUID();
		jdbc.sql("INSERT INTO " + schema + ".projects (id, key, name, created_at) VALUES (:id, :key, :key, now())")
			.param("id", id).param("key", key).update();
		jdbc.sql("INSERT INTO " + schema + ".issue_statuses (id, project_id, name, category, position) VALUES (:id, :p, 'To do', 'TODO', 0)")
			.param("id", UUID.randomUUID()).param("p", id).update();
		return id;
	}

	private void issue(String schema, UUID project, UUID user, int number, Instant updatedAt) {
		jdbc.sql("INSERT INTO " + schema + """
				.issues (id, project_id, number, type, title, priority, status_id, reporter_id, created_at, updated_at, version)
				SELECT :id, :p, :number, 'Story', :title, 'Medium', s.id, :user, :at, :at, 0
				FROM %s.issue_statuses s WHERE s.project_id = :p
				""".formatted(schema))
			.param("id", UUID.randomUUID()).param("p", project).param("number", number).param("title", "#" + number)
			.param("user", user).param("at", Timestamp.from(updatedAt)).update();
	}

	private java.util.List<Integer> numbersInRankOrder(String schema, UUID project) {
		return jdbc.sql("SELECT number FROM " + schema + ".issues WHERE project_id = :p ORDER BY rank")
			.param("p", project).query(Integer.class).list();
	}

}
