package com.nimbus.api.access.internal;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.Permission;
import com.nimbus.api.access.Scope;
import org.springframework.stereotype.Component;

/** What each built-in Role holds by default, from the catalog. Used at startup and by "Reset to defaults". */
@Component
class BuiltInDefaults {

	private final Catalog catalog;

	BuiltInDefaults(Catalog catalog) {
		this.catalog = catalog;
	}

	static Optional<BuiltInRole> builtIn(String key) {
		for (var role : BuiltInRole.values()) {
			if (role.key().equals(key)) {
				return Optional.of(role);
			}
		}
		return Optional.empty();
	}

	/** The Grants this built-in Role must always keep: permission key to Scope name. */
	Map<String, String> lockedOf(BuiltInRole role) {
		Map<String, String> locked = new HashMap<>();
		for (Permission permission : catalog.all()) {
			permission.defaults().stream()
				.filter(grant -> grant.role() == role && grant.locked())
				.forEach(grant -> locked.put(permission.key(), grant.scope().name()));
		}
		return locked;
	}

	/** Permission key to Scope name ({@code null} for platform permissions). Platform admin holds everything. */
	Map<String, String> grantsOf(BuiltInRole role) {
		Map<String, String> grants = new HashMap<>();
		for (Permission permission : catalog.all()) {
			if (role == BuiltInRole.PLATFORM_ADMIN) {
				grants.put(permission.key(), permission.kind() == Kind.PLATFORM ? null : Scope.ALL.name());
				continue;
			}
			permission.defaults().stream()
				.filter(grant -> grant.role() == role)
				.forEach(grant -> grants.put(permission.key(), grant.scope() == null ? null : grant.scope().name()));
		}
		return grants;
	}

}
