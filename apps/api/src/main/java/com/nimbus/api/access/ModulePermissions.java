package com.nimbus.api.access;

import java.util.List;

/**
 * Implemented by each module that has Permissions, as a Spring bean. At startup {@code access} collects every
 * declaration into the catalog. Keys must start with the declaring module's name.
 */
public interface ModulePermissions {

	List<Permission> permissions();

}
