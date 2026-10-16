package com.nimbus.api.access.internal;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Null;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.nimbus.api.access.Authorize;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.Scope;
import com.nimbus.api.identity.CurrentUser;
import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** The read-only Roles pages and what the signed-in User may do, for the web app to hide the rest. */
@RestController
@RequestMapping("/api/access")
@Validated
class AccessController {

	private final Catalog catalog;

	private final Roles roles;

	private final PlatformPermissionChecks platformPermissions;

	private final CurrentUser currentUser;

	private final RoleEditor editor;

	private final AuditLog audit;

	private final Users users;

	AccessController(Catalog catalog, Roles roles, PlatformPermissionChecks platformPermissions,
			CurrentUser currentUser, RoleEditor editor, AuditLog audit, Users users) {
		this.catalog = catalog;
		this.roles = roles;
		this.platformPermissions = platformPermissions;
		this.currentUser = currentUser;
		this.editor = editor;
		this.audit = audit;
		this.users = users;
	}

	/** Who made a change; {@code null} in the entry when it was the system. */
	record ActorResponse(UUID id, String displayName, String email) {
	}

	record TargetResponse(String type, String key) {
	}

	record AuditEntryResponse(UUID id, Instant at, ActorResponse actor, String action, TargetResponse target,
			JsonNode before, JsonNode after) {
	}

	record AuditResponse(List<AuditEntryResponse> entries, int page, int size, long total) {
	}

	/** Newest first. A User who no longer exists is shown by id alone. */
	@GetMapping("/audit")
	@Authorize(AccessPermissions.VIEW_AUDIT)
	AuditResponse audit(@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "50") @Min(1) @Max(100) int size) {
		var found = audit.page(page, size);
		var actorIds = found.entries().stream().map(AuditLog.Entry::actorId).filter(id -> id != null).distinct().toList();
		Map<UUID, UserSummary> actors = users.findAllById(actorIds).stream()
			.collect(Collectors.toMap(UserSummary::id, Function.identity()));
		return new AuditResponse(found.entries().stream().map(entry -> {
			ActorResponse actor = null;
			if (entry.actorId() != null) {
				var user = actors.get(entry.actorId());
				actor = user == null ? new ActorResponse(entry.actorId(), null, null)
						: new ActorResponse(user.id(), user.displayName(), user.email());
			}
			return new AuditEntryResponse(entry.id(), entry.at(), actor, entry.action(),
					new TargetResponse(entry.targetType(), entry.targetKey()), entry.before(), entry.after());
		}).toList(), page, size, found.total());
	}

	/** @param reserved only Platform admin may hold it */
	record PermissionResponse(String key, String heading, String description, String kind, List<String> scopes,
			String ownHint, boolean reserved) {
	}

	record PermissionsResponse(List<PermissionResponse> permissions) {
	}

	record RoleSummaryResponse(String key, String name, String description, String kind, boolean builtIn,
			boolean customised, int permissions, Integer holders) {
	}

	record RolesResponse(List<RoleSummaryResponse> roles) {
	}

	record RoleResponse(String key, String name, String description, String kind, boolean builtIn, boolean customised,
			boolean locked, int version, List<Roles.GrantView> grants, Integer holders, List<String> newPermissions) {
	}

	record MyPermissionsResponse(List<String> platform) {
	}

	/** Surrounding whitespace is dropped from the name and description before validation. */
	record CreateRoleRequest(
			@NotNull @Pattern(regexp = "[a-z][a-z0-9_]{1,49}",
					message = "Use 2 to 50 lowercase letters, digits and underscores, starting with a letter") String key,
			@NotBlank(message = "Enter a name") @Size(max = 100) String name,
			@Size(max = 500) String description,
			@NotNull @Pattern(regexp = "platform|project", message = "Choose platform or project") String kind) {

		CreateRoleRequest {
			name = name == null ? null : name.strip();
			description = description == null ? "" : description.strip();
		}

	}

	/** The catalog, grouped by heading and sorted by key, for the Roles page. */
	@GetMapping("/permissions")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	PermissionsResponse permissions() {
		return new PermissionsResponse(catalog.all().stream()
			.map(permission -> new PermissionResponse(permission.key(), permission.heading(),
					permission.description(), lower(permission.kind()),
					permission.scopes().stream().sorted().map(AccessController::lower).toList(), permission.ownHint(),
					RoleEditor.reserved(permission.key())))
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
				role.customised(), role.locked(), role.version(), role.grants(), role.holders(), role.newPermissions());
	}

	/**
	 * A {@code null} name or description leaves it as it is. The key and kind are fixed: sending either is refused,
	 * so a client can't believe it changed them.
	 */
	record DescribeRoleRequest(
			@Size(min = 1, max = 100, message = "Enter a name of at most 100 characters") String name,
			@Size(max = 500) String description,
			@NotNull(message = "Send the version the Role was opened at") Integer version,
			@Null(message = "A Role's key can't be changed") String key,
			@Null(message = "A Role's kind can't be changed") String kind) {

		DescribeRoleRequest {
			name = name == null ? null : name.strip();
			description = description == null ? null : description.strip();
		}

	}

	record SaveGrantsRequest(@NotNull(message = "Send the Grants, even if none") List<RoleEditor.RequestedGrant> grants,
			@NotNull(message = "Send the version the Role was opened at") Integer version) {
	}

	@PostMapping("/roles")
	@ResponseStatus(HttpStatus.CREATED)
	@Authorize(AccessPermissions.MANAGE_ROLES)
	RoleResponse create(@Valid @RequestBody CreateRoleRequest request) {
		editor.create(currentUser.id(), request.key(), request.name(), request.description(),
				Kind.valueOf(request.kind().toUpperCase(Locale.ROOT)));
		return role(request.key());
	}

	@PatchMapping("/roles/{key}")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	RoleResponse describe(@PathVariable String key, @Valid @RequestBody DescribeRoleRequest request) {
		editor.describe(currentUser.id(), key, request.name(), request.description(), request.version());
		return role(key);
	}

	/** Replaces every Grant of the Role in one save. */
	@PutMapping("/roles/{key}/grants")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	RoleResponse saveGrants(@PathVariable String key, @Valid @RequestBody SaveGrantsRequest request) {
		editor.saveGrants(currentUser.id(), key, request.grants(), request.version());
		return role(key);
	}

	@DeleteMapping("/roles/{key}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Authorize(AccessPermissions.MANAGE_ROLES)
	void delete(@PathVariable String key) {
		editor.delete(currentUser.id(), key);
	}

	record ResetRoleRequest(@NotNull(message = "Send the version the Role was opened at") Integer version) {
	}

	@PostMapping("/roles/{key}/reset")
	@Authorize(AccessPermissions.MANAGE_ROLES)
	RoleResponse reset(@PathVariable String key, @Valid @RequestBody ResetRoleRequest request) {
		editor.reset(currentUser.id(), key, request.version());
		return role(key);
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
