package com.nimbus.api.access.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who holds each platform role, for its People tab. Every change locks the Role first, so two changes to the same
 * Role take turns: two admins removing each other can't both succeed and leave Nimbus without a Platform admin.
 * Nobody changes their own assignments, so nobody can promote themselves or lock themselves out by mistake.
 */
@Component
@Transactional
class PlatformRoleHolders {

	private final JdbcClient jdbc;

	private final Users users;

	private final AuditLog audit;

	private final RequestMemo memo;

	PlatformRoleHolders(JdbcClient jdbc, Users users, AuditLog audit, RequestMemo memo) {
		this.jdbc = jdbc;
		this.users = users;
		this.audit = audit;
		this.memo = memo;
	}

	/**
	 * A User holding the Role.
	 *
	 * @param email {@code null}, like the name, for a User who no longer exists
	 * @param since when they were given it
	 */
	record Holder(UUID id, String email, String displayName, String avatarUrl, Instant since) {
	}

	/** Answered with {@code 404}. */
	static class UserNotFoundException extends RuntimeException {

		UserNotFoundException(String message) {
			super(message);
		}

	}

	/** Answered with {@code 403}. */
	static class OwnAssignmentException extends RuntimeException {

		OwnAssignmentException() {
			super("You can't change your own Role assignments; ask another Platform admin");
		}

	}

	/** Sorted by name, then email. */
	@Transactional(readOnly = true)
	List<Holder> of(String key) {
		var role = platformRole(key, false);
		var assigned = jdbc.sql("""
				SELECT user_id, created_at FROM access_role_assignments
				WHERE role_id = :role AND project_id IS NULL""")
			.param("role", role)
			.query((rs, n) -> Map.entry(rs.getObject("user_id", UUID.class), rs.getTimestamp("created_at").toInstant()))
			.list();
		Map<UUID, UserSummary> found = users.findAllById(assigned.stream().map(Map.Entry::getKey).toList()).stream()
			.collect(Collectors.toMap(UserSummary::id, Function.identity()));
		return assigned.stream()
			.map(entry -> holder(entry.getKey(), found.get(entry.getKey()), entry.getValue()))
			.sorted(Comparator.comparing((Holder holder) -> sortKey(holder.displayName()))
				.thenComparing(holder -> sortKey(holder.email())))
			.toList();
	}

	/** Gives the Role to the User with this email (any case, surrounding whitespace ignored). */
	Holder give(UUID actor, String key, String email) {
		var role = platformRole(key, true);
		var user = users.findByEmail(email)
			.orElseThrow(() -> new UserNotFoundException("No User has the email " + email.strip()));
		if (user.id().equals(actor)) {
			throw new OwnAssignmentException();
		}
		var now = Instant.now();
		var added = jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				VALUES (:id, :role, :user, NULL, :now)
				ON CONFLICT (user_id, role_id) WHERE project_id IS NULL DO NOTHING""")
			.param("id", UUID.randomUUID())
			.param("role", role)
			.param("user", user.id())
			.param("now", Timestamp.from(now))
			.update();
		if (added == 0) {
			throw new RoleEditor.RoleConflictException(user.email() + " already holds this Role");
		}
		memo.clear();
		audit.record(actor, "role.assigned", AuditLog.TargetType.ROLE, key, null, Map.of("user", about(user)));
		return holder(user.id(), user, now);
	}

	/** Takes the Role away from the User. Platform admin is never taken from its last holder. */
	void take(UUID actor, String key, UUID userId) {
		var role = platformRole(key, true);
		if (userId.equals(actor)) {
			throw new OwnAssignmentException();
		}
		var holds = jdbc.sql("""
				SELECT COUNT(*) FROM access_role_assignments
				WHERE role_id = :role AND project_id IS NULL AND user_id = :user""")
			.param("role", role)
			.param("user", userId)
			.query(Integer.class)
			.single() > 0;
		if (!holds) {
			throw new UserNotFoundException("That User doesn't hold this Role");
		}
		if (BuiltInRole.PLATFORM_ADMIN.key().equals(key)) {
			var holders = jdbc.sql(
					"SELECT COUNT(*) FROM access_role_assignments WHERE role_id = :role AND project_id IS NULL")
				.param("role", role)
				.query(Integer.class)
				.single();
			if (holders <= 1) {
				throw new RoleEditor.RoleConflictException(
						"This is the last Platform admin; give the Role to someone else first, so Nimbus always has one");
			}
		}
		jdbc.sql("DELETE FROM access_role_assignments WHERE role_id = :role AND project_id IS NULL AND user_id = :user")
			.param("role", role)
			.param("user", userId)
			.update();
		memo.clear();
		var user = users.findAllById(List.of(userId)).stream().findFirst();
		audit.record(actor, "role.unassigned", AuditLog.TargetType.ROLE, key,
				Map.of("user", user.map(PlatformRoleHolders::about).orElse(Map.of("id", userId.toString()))), null);
	}

	/** The User as the audit log keeps them: id and the email they had then. */
	static Map<String, String> about(UserSummary user) {
		return Map.of("id", user.id().toString(), "email", user.email());
	}

	/** The Role's id if it is a platform role with holders, locked for this transaction when {@code lock}. */
	private UUID platformRole(String key, boolean lock) {
		var role = jdbc.sql("SELECT id, kind FROM access_roles WHERE key = :key" + (lock ? " FOR UPDATE" : ""))
			.param("key", key)
			.query((rs, n) -> Map.entry(rs.getObject("id", UUID.class), Kind.valueOf(rs.getString("kind"))))
			.optional()
			.orElseThrow(() -> new Roles.RoleNotFoundException(key));
		if (role.getValue() == Kind.PROJECT) {
			throw new RoleEditor.RoleConflictException(
					"This is a project role: Members get it on a project's Members page");
		}
		if (BuiltInRole.EVERYONE.key().equals(key)) {
			throw new RoleEditor.RoleConflictException(
					"Every signed-in User holds Everyone; it has no holders to list or change");
		}
		return role.getKey();
	}

	private static Holder holder(UUID id, UserSummary user, Instant since) {
		return user == null ? new Holder(id, null, null, null, since)
				: new Holder(id, user.email(), user.displayName(), user.avatarUrl(), since);
	}

	private static String sortKey(String text) {
		return text == null ? "" : text.toLowerCase(Locale.ROOT);
	}

}
