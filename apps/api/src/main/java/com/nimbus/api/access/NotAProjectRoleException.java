package com.nimbus.api.access;

/** The key named no Role, or a platform role, where a project role was needed. */
public class NotAProjectRoleException extends RuntimeException {

	public NotAProjectRoleException(String role) {
		super(role + " is not a project role");
	}

}
