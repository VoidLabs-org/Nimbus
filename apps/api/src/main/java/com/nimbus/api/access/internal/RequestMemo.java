package com.nimbus.api.access.internal;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * Remembers answers until the end of the current request, so a request asking the same thing several times reads
 * the database once. Outside a request (startup, a listener on another thread) nothing is remembered. Changes to
 * Grants and Role assignments clear it, so a request sees its own changes.
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

	/**
	 * Forgets everything; every write to Grants or Role assignments calls it. It forgets again when the transaction
	 * ends, so answers read inside a transaction that rolls back don't outlive it.
	 */
	void clear() {
		forget();
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {

				@Override
				public void afterCompletion(int status) {
					forget();
				}

			});
		}
	}

	private static void forget() {
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
