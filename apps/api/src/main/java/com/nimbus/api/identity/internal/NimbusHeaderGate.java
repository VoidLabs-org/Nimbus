package com.nimbus.api.identity.internal;

import java.io.IOException;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Endpoints that a cookie alone authenticates must come from the Nimbus app: they need {@code X-Requested-With:
 * nimbus}, which cross-site forms can't set, or they answer {@code 403}. On {@link #READS_BODY_TOKEN} the Mobile
 * app's {@code X-Nimbus-Client: mobile} passes too: forms can't set it either, and with it those endpoints read the
 * token from the body and ignore the cookie. An endpoint goes there only once it does that. A new endpoint like them goes in
 * {@link #COOKIE_ONLY}, so none can forget the check. Not a bean, for the same reason as {@link EmailVerifiedGate}.
 */
class NimbusHeaderGate extends OncePerRequestFilter {

	/**
	 * The POST endpoints whose only credential is a cookie, and the Desktop app's code exchange, which needs no Bearer
	 * token but reads the remembered cookie and sets the sign-in's cookies.
	 */
	static final Set<String> COOKIE_ONLY = Set.of("/api/auth/refresh", "/api/auth/logout", "/api/auth/two-step",
			"/api/auth/desktop/exchange");

	/** The cookie endpoints that, for the Mobile app, take the refresh token from the body instead (ADR 0010). */
	static final Set<String> READS_BODY_TOKEN = Set.of("/api/auth/refresh", "/api/auth/logout");

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (HttpMethod.POST.matches(request.getMethod()) && COOKIE_ONLY.contains(request.getRequestURI())
				&& !"nimbus".equals(request.getHeader("X-Requested-With")) && !mobileReadingTheBody(request)) {
			ProblemResponses.write(request, response,
					ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "This request must come from the Nimbus app"));
			return;
		}
		chain.doFilter(request, response);
	}

	private static boolean mobileReadingTheBody(HttpServletRequest request) {
		return READS_BODY_TOKEN.contains(request.getRequestURI()) && AuthController.fromMobileApp(request);
	}

}
