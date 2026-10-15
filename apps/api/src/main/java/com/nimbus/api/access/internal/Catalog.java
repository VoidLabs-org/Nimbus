package com.nimbus.api.access.internal;

import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.ModulePermissions;
import com.nimbus.api.access.Permission;
import com.nimbus.api.access.Scope;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;

/**
 * Every Permission the modules declare. A declaration that breaks the rules stops startup, so a mistake is
 * found when it is written, not when an admin opens the Roles page.
 */
@Component
class Catalog {

	private static final String BASE_PACKAGE = "com.nimbus.api.";

	private static final Pattern KEY = Pattern.compile("[a-z]+(_[a-z]+)*(:[a-z]+(_[a-z]+)*){2}");

	private final Map<String, Permission> byKey = new LinkedHashMap<>();

	Catalog(List<ModulePermissions> declarations) {
		declarations.stream()
			.flatMap(declaration -> declaration.permissions().stream()
				.peek(permission -> check(permission, moduleOf(declaration))))
			.sorted(Comparator.comparing(Permission::heading).thenComparing(Permission::key))
			.forEach(permission -> {
				if (byKey.putIfAbsent(permission.key(), permission) != null) {
					throw new IllegalStateException("Permission " + permission.key() + " is declared twice");
				}
			});
	}

	Collection<Permission> all() {
		return byKey.values();
	}

	Optional<Permission> find(String key) {
		return Optional.ofNullable(byKey.get(key));
	}

	private static String moduleOf(ModulePermissions declaration) {
		var name = ClassUtils.getUserClass(declaration).getPackageName();
		if (!name.startsWith(BASE_PACKAGE)) {
			throw new IllegalStateException(declaration + " is not in a Nimbus module");
		}
		var module = name.substring(BASE_PACKAGE.length());
		var dot = module.indexOf('.');
		return dot < 0 ? module : module.substring(0, dot);
	}

	private static void check(Permission permission, String module) {
		var key = permission.key();
		if (!KEY.matcher(key).matches()) {
			throw invalid(key, "must be module:resource:action in lowercase");
		}
		if (!key.startsWith(module + ":")) {
			throw invalid(key, "must start with its module's name, " + module);
		}
		if (permission.kind() == Kind.PLATFORM && !permission.scopes().isEmpty()) {
			throw invalid(key, "is a platform permission, which has no Scope");
		}
		if (permission.scopes().contains(Scope.ALL)) {
			throw invalid(key, "can't allow ALL in project roles; platform roles hold project permissions with ALL");
		}
		if (permission.ownHint() != null && !permission.scopes().contains(Scope.OWN)) {
			throw invalid(key, "has an own hint but doesn't allow OWN");
		}
		for (var grant : permission.defaults()) {
			checkDefault(permission, grant);
		}
	}

	private static void checkDefault(Permission permission, Permission.Default grant) {
		var key = permission.key();
		if (grant.role() == BuiltInRole.PLATFORM_ADMIN) {
			throw invalid(key, "lists Platform admin as a default; it always holds every Permission");
		}
		if (grant.role().kind() != permission.kind()) {
			throw invalid(key, "is a " + permission.kind() + " permission but defaults to the "
					+ grant.role().kind() + " role " + grant.role().key());
		}
		if (permission.kind() == Kind.PLATFORM ? grant.scope() != null : !permission.scopes().contains(grant.scope())) {
			throw invalid(key, "defaults to a Scope it doesn't allow in " + grant.role().key());
		}
	}

	private static IllegalStateException invalid(String key, String problem) {
		return new IllegalStateException("Permission " + key + " " + problem);
	}

}
