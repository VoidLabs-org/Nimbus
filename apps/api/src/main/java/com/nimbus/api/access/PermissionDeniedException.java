package com.nimbus.api.access;

/** The User may see what they asked for but lacks the Permission to do it: answered with {@code 403}. */
public class PermissionDeniedException extends RuntimeException {

	public PermissionDeniedException(String permission) {
		super("You don't have permission to do this (" + permission + ")");
	}

}
