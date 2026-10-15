package com.nimbus.api.access;

/**
 * How far a Grant reaches. In a project role: {@link #OWN} (only the User's own records, as the owning module
 * defines them) or {@link #PROJECT} (everything in that project). In a platform role: {@link #ALL} (everything in
 * every project). Platform permissions have no Scope.
 */
public enum Scope {

	OWN, PROJECT, ALL

}
