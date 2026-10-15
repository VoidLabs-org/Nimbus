package com.nimbus.api.access;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * One Permission in the catalog, as a module declares it in code (see {@link ModulePermissions}). Its key is
 * {@code module:resource:action}, lowercase, starting with the declaring module's name. A platform permission is
 * granted in platform roles without a Scope. A project permission is granted in project roles with one of its
 * allowed Scopes, and in platform roles only with {@link Scope#ALL}.
 *
 * @param key the catalog key, such as {@code issues:issue:edit}
 * @param heading the module heading the Roles page groups it under, such as {@code Issues}
 * @param description one line saying what it allows
 * @param kind platform or project
 * @param scopes the Scopes it may have in project roles: empty for platform permissions, and for project
 * permissions that only platform roles may hold (with {@link Scope#ALL})
 * @param ownHint what "own" means for it, shown next to Scope Own; {@code null} when Own is not allowed
 * @param defaults its Grants in the built-in Roles (Platform admin always holds everything and is never listed)
 */
public record Permission(String key, String heading, String description, Kind kind, Set<Scope> scopes,
		String ownHint, List<Default> defaults) {

	/**
	 * A default Grant in a built-in Role.
	 *
	 * @param scope {@code null} for platform permissions
	 * @param locked whether the Role must always keep it, whatever an admin edits
	 */
	public record Default(BuiltInRole role, Scope scope, boolean locked) {

		public Default {
			Objects.requireNonNull(role, "role");
		}

	}

	public Permission {
		Objects.requireNonNull(key, "key");
		Objects.requireNonNull(heading, "heading");
		Objects.requireNonNull(description, "description");
		Objects.requireNonNull(kind, "kind");
		scopes = scopes.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(scopes));
		defaults = List.copyOf(defaults);
	}

	/** A platform permission, such as creating a project. */
	public static Permission platform(String key, String heading, String description) {
		return new Permission(key, heading, description, Kind.PLATFORM, Set.of(), null, List.of());
	}

	/** A project permission that project roles may hold with the given Scopes. */
	public static Permission project(String key, String heading, String description, Scope... scopes) {
		return new Permission(key, heading, description, Kind.PROJECT, Set.of(scopes), null, List.of());
	}

	/** The same Permission, with what Scope Own means for it. */
	public Permission ownHint(String hint) {
		return new Permission(key, heading, description, kind, scopes, hint, defaults);
	}

	/** The same Permission, granted by default in a built-in platform role (platform permissions only). */
	public Permission grantedTo(BuiltInRole role) {
		return withDefault(new Default(role, null, false));
	}

	/** The same Permission, granted by default in a built-in project role with this Scope. */
	public Permission grantedTo(BuiltInRole role, Scope scope) {
		return withDefault(new Default(role, Objects.requireNonNull(scope, "scope"), false));
	}

	/**
	 * The same Permission, granted by default in a built-in project role with this Scope, and impossible to remove
	 * from it, e.g. so a project always has someone who can manage its Members.
	 */
	public Permission lockedIn(BuiltInRole role, Scope scope) {
		return withDefault(new Default(role, Objects.requireNonNull(scope, "scope"), true));
	}

	private Permission withDefault(Default added) {
		var all = new ArrayList<>(defaults);
		all.add(added);
		return new Permission(key, heading, description, kind, scopes, ownHint, all);
	}

}
