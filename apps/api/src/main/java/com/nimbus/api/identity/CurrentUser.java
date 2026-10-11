package com.nimbus.api.identity;

import java.util.UUID;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * The User making the current request. Other modules inject this instead of reading tokens themselves.
 */
@Component
public class CurrentUser {

	/**
	 * Returns the signed-in User's id.
	 *
	 * @throws AuthenticationCredentialsNotFoundException when nobody is signed in; the request then gets a 401
	 */
	public UUID id() {
		if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token) {
			return UUID.fromString(token.getName());
		}
		throw new AuthenticationCredentialsNotFoundException("No signed-in User for this request");
	}

}
