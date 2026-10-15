package com.nimbus.api.access.internal;

import java.util.List;
import java.util.Locale;

import com.nimbus.api.access.Authorize;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.Scope;
import com.nimbus.api.identity.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The read-only Roles pages and what the signed-in User may do, for the web app to hide the rest. */
@RestController
@RequestMapping("/api/access")
class AccessController {

	private final Catalog catalog;

	private final Roles roles;

	private final PlatformPermissionChecks platformPermissions;

	private final CurrentUser currentUser;

	AccessController(Catalog catalog, Roles roles, PlatformPermissionChecks platformPermissions,
			CurrentUser currentUser) {
		this.catalog = catalog;
		this.roles = roles;
		this.platformPermissions = platformPermissions;
		this.currentUser = currentUser;
	}

	record PermissionResponse(String key, String heading, String description, String kind, List<String> scopes,
			String ownHint) {
	}

	record PermissionsResponse(List<PermissionResponse> permissions) {
	}

	record RoleSummaryResponse(String key, String name, String description, String kind, boolean builtIn,
			boolean customised, int permissions, Integer holders) {
	}

	record RolesResponse(List<RoleSummaryResponse> roles) {
	}

	record RoleResponse(String key, String name, String description, String kind, boolean builtIn, boolean customised,
			int version, List<Roles.GrantView> grants, Integer holders) {
	}

	record MyPermissionsResponse(List<String> platform) {
	}

	/** The catalog, grouped by heading and sorted by key, for the Roles page. */
	@GetMapping("/permissions")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	PermissionsResponse permissions() {
		return new PermissionsResponse(catalog.all().stream()
			.map(permission -> new PermissionResponse(permission.key(), permission.heading(),
					permission.description(), lower(permission.kind()),
					permission.scopes().stream().sorted().map(AccessController::lower).toList(), permission.ownHint()))
			.toList());
	}

	@GetMapping("/roles")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	RolesResponse roles() {
		return new RolesResponse(roles.all().stream()
			.map(role -> new RoleSummaryResponse(role.key(), role.name(), role.description(), lower(role.kind()),
					role.builtIn(), role.customised(), role.grants().size(), role.holders()))
			.toList());
	}

	@GetMapping("/roles/{key}")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	RoleResponse role(@PathVariable String key) {
		var role = roles.require(key);
		return new RoleResponse(role.key(), role.name(), role.description(), lower(role.kind()), role.builtIn(),
				role.customised(), role.version(), role.grants(), role.holders());
	}

	/** The signed-in User's platform permissions; anyone signed in may ask. */
	@GetMapping("/me/permissions")
	MyPermissionsResponse myPermissions() {
		return new MyPermissionsResponse(platformPermissions.heldBy(currentUser.id()));
	}

	private static String lower(Kind kind) {
		return kind.name().toLowerCase(Locale.ROOT);
	}

	private static String lower(Scope scope) {
		return scope.name().toLowerCase(Locale.ROOT);
	}

}
