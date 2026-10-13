package com.nimbus.api.identity.internal;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

/**
 * For a browser page load of an API address without a token: sends the browser to the web app's sign-in page on
 * the public URL. Spring's own redirect only starts a provider sign-in when exactly one provider is on, and with
 * two it lands on a generated page on the API host, which has no web app.
 */
class WebLoginEntryPoint implements AuthenticationEntryPoint {

	private final String loginUrl;

	/** @param publicUrl where the browser sees Nimbus, without a trailing slash */
	WebLoginEntryPoint(String publicUrl) {
		this.loginUrl = publicUrl + "/login";
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException {
		response.sendRedirect(loginUrl);
	}

}
