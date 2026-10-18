package com.nimbus.api.identity.internal;

import java.io.IOException;
import java.net.URI;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.http.server.ServletServerHttpResponse;

/**
 * Writes an RFC 9457 problem detail from a servlet filter, which runs before Spring MVC and so can't hand an error to
 * {@code IdentityErrors}. It writes what MVC would: the same JSON converter, and {@code instance} set to the
 * request's path. Any filter in this module that refuses a request should answer through here, so every error
 * keeps one format.
 */
final class ProblemResponses {

	private static final JacksonJsonHttpMessageConverter CONVERTER = new JacksonJsonHttpMessageConverter();

	private ProblemResponses() {
	}

	static void write(HttpServletRequest request, HttpServletResponse response, ProblemDetail problem)
			throws IOException {
		problem.setInstance(URI.create(request.getRequestURI()));
		response.setStatus(problem.getStatus());
		CONVERTER.write(problem, MediaType.APPLICATION_PROBLEM_JSON, new ServletServerHttpResponse(response));
	}

}
