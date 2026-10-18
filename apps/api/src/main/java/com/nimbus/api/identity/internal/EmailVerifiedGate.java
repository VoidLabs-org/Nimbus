package com.nimbus.api.identity.internal;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Keeps an Unverified User out of everything but verifying their email. It runs after the access token has been
 * checked. A token whose {@code ev} claim says the email is verified passes without a database lookup (a User
 * never becomes unverified again). Any other token, including one issued before the claim existed or before
 * the User verified, is checked against the User's row.
 *
 * <p>Allowed for an Unverified User, by exact method and path: {@code GET /api/users/me}, verifying, signing out and
 * refreshing, and the public sign-in endpoints (a stale token may ride along). Everything else, including
 * anything added under {@code /api/auth/} later, is a {@code 403} with {@code code: email_unverified}.
 * This filter is not a bean: Spring Boot would register a bean filter a second time for every request.
 */
class EmailVerifiedGate extends OncePerRequestFilter {

	static final String ERROR_CODE = "email_unverified";

	private static final Set<String> ALLOWED_POSTS = Set.of("/api/auth/verify-email", "/api/auth/logout",
			"/api/auth/refresh", "/api/auth/login", "/api/auth/register");

	private final UserRepository users;

	EmailVerifiedGate(UserRepository users) {
		this.users = users;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token
				&& !allowedForUnverified(request) && !verified(token)) {
			var problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Verify your email to use Nimbus");
			problem.setProperty("code", ERROR_CODE);
			ProblemResponses.write(request, response, problem);
			return;
		}
		chain.doFilter(request, response);
	}

	private static boolean allowedForUnverified(HttpServletRequest request) {
		var path = request.getRequestURI();
		if (HttpMethod.GET.matches(request.getMethod())) {
			return path.equals("/api/users/me") || path.equals("/api/auth/providers")
					|| path.startsWith("/api/auth/oauth2/");
		}
		return HttpMethod.POST.matches(request.getMethod()) && ALLOWED_POSTS.contains(path);
	}

	private boolean verified(JwtAuthenticationToken token) {
		if (Boolean.TRUE.equals(token.getToken().getClaims().get(AccessTokens.VERIFIED_CLAIM))) {
			return true;
		}
		// A User who no longer exists is the endpoints' 401 to report, not the gate's.
		return users.findById(UUID.fromString(token.getName())).map(User::emailVerified).orElse(true);
	}

}
