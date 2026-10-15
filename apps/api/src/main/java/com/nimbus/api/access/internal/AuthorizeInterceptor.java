package com.nimbus.api.access.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.nimbus.api.access.Authorize;
import com.nimbus.api.access.PlatformPermissions;
import com.nimbus.api.identity.CurrentUser;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Enforces {@link Authorize} on controller methods (or whole controllers) of every module. Security has already
 * turned away requests without a valid token, so a User is always signed in here.
 */
@Configuration
class AuthorizeInterceptor implements HandlerInterceptor, WebMvcConfigurer {

	private final PlatformPermissions permissions;

	private final CurrentUser currentUser;

	AuthorizeInterceptor(PlatformPermissions permissions, CurrentUser currentUser) {
		this.permissions = permissions;
		this.currentUser = currentUser;
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(this);
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (handler instanceof HandlerMethod method) {
			var required = AnnotatedElementUtils.findMergedAnnotation(method.getMethod(), Authorize.class);
			if (required == null) {
				required = AnnotatedElementUtils.findMergedAnnotation(method.getBeanType(), Authorize.class);
			}
			if (required != null) {
				permissions.require(currentUser.id(), required.value());
			}
		}
		return true;
	}

}
