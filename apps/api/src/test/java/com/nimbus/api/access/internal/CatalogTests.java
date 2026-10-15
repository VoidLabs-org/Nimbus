package com.nimbus.api.access.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.ModulePermissions;
import com.nimbus.api.access.Permission;
import com.nimbus.api.access.Scope;
import org.junit.jupiter.api.Test;

/**
 * A module's Permission declarations are checked when the app starts, so a mistake stops startup with a message
 * naming the Permission. Declarations made here belong to the access module, by their package.
 */
class CatalogTests {

	@Test
	void validDeclarationsAreSortedByHeadingAndKey() {
		var catalog = catalogOf(
				Permission.project("access:thing:edit", "B things", "Edit things", Scope.OWN, Scope.PROJECT)
					.ownHint("Things you made")
					.grantedTo(BuiltInRole.DEVELOPER, Scope.OWN),
				Permission.platform("access:thing:create", "A things", "Create things").grantedTo(BuiltInRole.EVERYONE));

		assertThat(catalog.all()).extracting(Permission::key).containsExactly("access:thing:create", "access:thing:edit");
	}

	@Test
	void aKeyMustStartWithTheDeclaringModule() {
		assertRefused(Permission.platform("issues:issue:create", "Issues", "Create Issues"),
				"must start with its module's name, access");
	}

	@Test
	void aKeyMustBeModuleResourceActionInLowercase() {
		assertRefused(Permission.platform("access:Thing:create", "A", "x"), "module:resource:action");
		assertRefused(Permission.platform("access:create", "A", "x"), "module:resource:action");
	}

	@Test
	void aKeyCanBeDeclaredOnlyOnce() {
		assertThatThrownBy(() -> catalogOf(Permission.platform("access:thing:create", "A", "x"),
				Permission.platform("access:thing:create", "A", "y")))
			.hasMessageContaining("access:thing:create is declared twice");
	}

	@Test
	void defaultsMustFitThePermission() {
		assertRefused(Permission.project("access:thing:edit", "A", "x", Scope.PROJECT)
			.grantedTo(BuiltInRole.DEVELOPER, Scope.OWN), "a Scope it doesn't allow");
		assertRefused(Permission.platform("access:thing:create", "A", "x").grantedTo(BuiltInRole.DEVELOPER),
				"defaults to the PROJECT role developer");
		assertRefused(Permission.platform("access:thing:create", "A", "x").grantedTo(BuiltInRole.PLATFORM_ADMIN),
				"always holds every Permission");
	}

	@Test
	void projectRolesNeverGetScopeAll() {
		assertRefused(Permission.project("access:thing:edit", "A", "x", Scope.ALL), "can't allow ALL");
	}

	@Test
	void anOwnHintNeedsScopeOwn() {
		assertRefused(Permission.project("access:thing:edit", "A", "x", Scope.PROJECT).ownHint("Yours"),
				"doesn't allow OWN");
	}

	private static void assertRefused(Permission permission, String reason) {
		assertThatThrownBy(() -> catalogOf(permission)).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining(permission.key())
			.hasMessageContaining(reason);
	}

	private static Catalog catalogOf(Permission... permissions) {
		ModulePermissions declaration = () -> List.of(permissions);
		return new Catalog(List.of(declaration));
	}

}
