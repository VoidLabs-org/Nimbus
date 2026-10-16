package com.nimbus.api.access.internal;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * Remembers answers until the end of the current request, so a request asking the same thing several times reads
 * the database once. Outside a request (startup, a listener on another thread) nothing is remembered. Changes to
 * Role assignments clear it, so a request sees its own changes.
 */
@Component
class RequestMemo {

	private static final String ATTRIBUTE = RequestMemo.class.getName();

	@SuppressWarnings("unchecked")
	<T> T get(Object key, Supplier<T> load) {
		var answers = answers();
		if (answers == null) {
			return load.get();
		}
		if (answers.containsKey(key)) {
			return (T) answers.get(key);
		}
		var answer = load.get();
		answers.put(key, answer);
		return answer;
	}

	void clear() {
		var answers = answers();
		if (answers != null) {
			answers.clear();
		}
	}

	@SuppressWarnings("unchecked")
	private static Map<Object, Object> answers() {
		var request = RequestContextHolder.getRequestAttributes();
		if (request == null) {
			return null;
		}
		var answers = (Map<Object, Object>) request.getAttribute(ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
		if (answers == null) {
			answers = new HashMap<>();
			request.setAttribute(ATTRIBUTE, answers, RequestAttributes.SCOPE_REQUEST);
		}
		return answers;
	}

}
