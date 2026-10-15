package com.nimbus.api.access;

/** The Roles every Nimbus has. Modules name them when declaring the default Grants of their Permissions. */
public enum BuiltInRole {

	/** Holds every Permission, including ones added later, project permissions with {@link Scope#ALL}. Locked. */
	PLATFORM_ADMIN("platform_admin", Kind.PLATFORM, "Platform admin",
			"Full access to every project and to Nimbus administration."),

	/** Held by every signed-in User without being assigned. */
	EVERYONE("everyone", Kind.PLATFORM, "Everyone", "What every signed-in User may do."),

	PROJECT_ADMIN("project_admin", Kind.PROJECT, "Project admin", "Manages a project and its Members."),

	DEVELOPER("developer", Kind.PROJECT, "Developer", "Works on a project."),

	VIEWER("viewer", Kind.PROJECT, "Viewer", "Sees a project without changing it.");

	private final String key;

	private final Kind kind;

	private final String defaultName;

	private final String defaultDescription;

	BuiltInRole(String key, Kind kind, String defaultName, String defaultDescription) {
		this.key = key;
		this.kind = kind;
		this.defaultName = defaultName;
		this.defaultDescription = defaultDescription;
	}

	public String key() {
		return key;
	}

	public Kind kind() {
		return kind;
	}

	public String defaultName() {
		return defaultName;
	}

	public String defaultDescription() {
		return defaultDescription;
	}

}
