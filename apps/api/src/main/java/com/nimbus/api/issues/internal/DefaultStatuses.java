package com.nimbus.api.issues.internal;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The Statuses every project starts with. They are made lazily, by whoever first needs them, while holding the
 * project's {@code issue_counters} row lock, so they are made once even under concurrent requests.
 */
final class DefaultStatuses {

	private static final List<String[]> DEFAULTS = List.of(new String[] { "To do", "TODO" },
			new String[] { "In progress", "IN_PROGRESS" }, new String[] { "Done", "DONE" });

	private DefaultStatuses() {
	}

	/** Makes the default Statuses if the project has none. The caller holds the project's counter lock. */
	static void ensure(JdbcClient jdbc, UUID projectId) {
		var existing = jdbc.sql("SELECT count(*) FROM issue_statuses WHERE project_id = :project")
			.param("project", projectId).query(Long.class).single();
		if (existing > 0) return;
		for (int position = 0; position < DEFAULTS.size(); position++) {
			jdbc.sql("INSERT INTO issue_statuses (id, project_id, name, category, position) VALUES (:id, :project, :name, :category, :position)")
				.param("id", UUID.randomUUID()).param("project", projectId).param("name", DEFAULTS.get(position)[0])
				.param("category", DEFAULTS.get(position)[1]).param("position", position).update();
		}
	}
}
