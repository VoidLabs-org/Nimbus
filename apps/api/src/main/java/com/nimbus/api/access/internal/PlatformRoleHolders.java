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
 * Who holds each platform role, for its People tab and the admin-email bootstrap. Every change locks the Role first,
 * so two changes to the same Role take turns: two admins removing each other can't both succeed and leave Nimbus
 * without a Platform admin. Nobody changes their own assignments, so nobody can promote themselves or lock themselves
 * out by mistake. Only Users who proved their email get a platform role: anyone can register someone else's address
 * with a password, and would otherwise receive what an admin meant for its real owner.
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
		var assigned = assignments(platformRole(key, false));
		Map<UUID, UserSummary> found = existing(assigned.keySet());
		return assigned.entrySet().stream()
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
		if (!user.emailVerified()) {
			throw new RoleEditor.RoleConflictException(user.email() + " hasn't verified their email yet. They verify "
					+ "it by entering the code emailed to them, or by signing in once with Google or GitHub on that address.");
		}
		var since = Instant.now();
		if (!assign(actor, role, key, user, since)) {
			throw new RoleEditor.RoleConflictException(user.email() + " already holds this Role");
		}
		return holder(user.id(), user, since);
	}

	/**
	 * Makes a verified User Platform admin on behalf of the system (the admin email); nothing happens if they already
	 * are. {@code false} when nothing changed.
	 */
	boolean makePlatformAdmin(UserSummary user) {
		if (!user.emailVerified()) {
			return false;
		}
		var key = BuiltInRole.PLATFORM_ADMIN.key();
		return assign(null, platformRole(key, true), key, user, Instant.now());
	}

	/** Takes the Role away from the User. Platform admin is never taken from its last holder who still exists. */
	void take(UUID actor, String key, UUID userId) {
		var role = platformRole(key, true);
		if (userId.equals(actor)) {
			throw new OwnAssignmentException();
		}
		var removed = jdbc.sql("""
				DELETE FROM access_role_assignments WHERE role_id = :role AND project_id IS NULL AND user_id = :user""")
			.param("role", role)
			.param("user", userId)
			.update();
		if (removed == 0) {
			throw new UserNotFoundException("That User doesn't hold this Role");
		}
		// Thrown after the delete, so the transaction rolls it back.
		if (BuiltInRole.PLATFORM_ADMIN.key().equals(key) && existing(assignments(role).keySet()).isEmpty()) {
			throw new RoleEditor.RoleConflictException(
					"This is the last Platform admin; give the Role to someone else first, so Nimbus always has one");
		}
		memo.clear();
		var user = users.findAllById(List.of(userId)).stream().findFirst();
		audit.record(actor, "role.unassigned", AuditLog.TargetType.ROLE, key,
				Map.of("user", user.map(PlatformRoleHolders::about).orElse(Map.of("id", userId.toString()))), null);
	}

	/** Adds the assignment and its audit entry; {@code false} if the User already held the Role. */
	private boolean assign(UUID actor, UUID role, String key, UserSummary user, Instant since) {
		var added = jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				VALUES (:id, :role, :user, NULL, :since)
				ON CONFLICT (user_id, role_id) WHERE project_id IS NULL DO NOTHING""")
			.param("id", UUID.randomUUID())
			.param("role", role)
			.param("user", user.id())
			.param("since", Timestamp.from(since))
			.update();
		if (added == 0) {
			return false;
		}
		memo.clear();
		audit.record(actor, "role.assigned", AuditLog.TargetType.ROLE, key, null, Map.of("user", about(user)));
		return true;
	}

	/** The User as the audit log keeps them: id and the email they had then. */
	private static Map<String, String> about(UserSummary user) {
		return Map.of("id", user.id().toString(), "email", user.email());
	}

	/** User id to when they were given the Role. */
	private Map<UUID, Instant> assignments(UUID role) {
		return jdbc.sql("""
				SELECT user_id, created_at FROM access_role_assignments WHERE role_id = :role AND project_id IS NULL""")
			.param("role", role)
			.query((rs, n) -> Map.entry(rs.getObject("user_id", UUID.class), rs.getTimestamp("created_at").toInstant()))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	private Map<UUID, UserSummary> existing(java.util.Collection<UUID> ids) {
		return users.findAllById(ids).stream().collect(Collectors.toMap(UserSummary::id, Function.identity()));
	}

	/** The Role's id if it is a platform role with holders, locked for this transaction when {@code lock}. */
	private UUID platformRole(String key, boolean lock) {
		var role = RoleEditor.stored(jdbc, key, lock);
		if (role.kind() == Kind.PROJECT) {
			throw new RoleEditor.RoleConflictException(
					"This is a project role: Members get it on a project's Members page");
		}
		if (BuiltInRole.EVERYONE.key().equals(key)) {
			throw new RoleEditor.RoleConflictException(
					"Every signed-in User holds Everyone; it has no holders to list or change");
		}
		return role.id();
	}

	private static Holder holder(UUID id, UserSummary user, Instant since) {
		return user == null ? new Holder(id, null, null, null, since)
				: new Holder(id, user.email(), user.displayName(), user.avatarUrl(), since);
	}

	private static String sortKey(String text) {
		return text == null ? "" : text.toLowerCase(Locale.ROOT);
	}

}
