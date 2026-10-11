package com.nimbus.api.identity;

import java.net.HttpCookie;

import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.EntityExchangeResult;

/** Reads the refresh cookie a response sets, so tests don't each parse Set-Cookie themselves. */
final class RefreshCookies {

	private RefreshCookies() {
	}

	static HttpCookie of(EntityExchangeResult<?> result) {
		return result.getResponseHeaders().getValuesAsList(HttpHeaders.SET_COOKIE).stream()
			.flatMap(header -> HttpCookie.parse(header).stream())
			.filter(cookie -> cookie.getName().equals("refresh_token"))
			.findFirst()
			.orElseThrow(() -> new AssertionError("no refresh_token cookie was set"));
	}

	static String valueOf(EntityExchangeResult<?> result) {
		return of(result).getValue();
	}

}
