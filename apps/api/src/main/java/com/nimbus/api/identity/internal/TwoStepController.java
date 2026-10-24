package com.nimbus.api.identity.internal;

import java.util.List;

import com.nimbus.api.identity.CurrentUser;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Two-step verification on the Security page; every call needs a Session that is still running. */
@RestController
@RequestMapping("/api/users/me/two-step")
class TwoStepController {

	private final TwoStep twoStep;

	private final CurrentUser currentUser;

	TwoStepController(TwoStep twoStep, CurrentUser currentUser) {
		this.twoStep = twoStep;
		this.currentUser = currentUser;
	}

	@GetMapping
	TwoStep.Status status(@AuthenticationPrincipal Jwt token) {
		return twoStep.status(currentUser.id(), UsersController.sessionOf(token));
	}

	/** A new key for the authenticator app; needs a Session that started recently. */
	@PostMapping("/setup")
	TwoStep.SetupStarted startSetup(@AuthenticationPrincipal Jwt token) {
		return twoStep.startSetup(currentUser.id(), UsersController.sessionOf(token));
	}

	/** A code from the app proves it has the key; answers with the Recovery codes to save. */
	@PostMapping("/setup/verify")
	RecoveryCodesResponse verifySetup(@AuthenticationPrincipal Jwt token, @RequestBody CodeRequest request) {
		return new RecoveryCodesResponse(
				twoStep.verifySetup(currentUser.id(), UsersController.sessionOf(token), request.code()));
	}

	/** Turns Two-step verification on with the setup the User just proved. */
	@PostMapping
	ResponseEntity<Void> turnOn(@AuthenticationPrincipal Jwt token) {
		twoStep.turnOn(currentUser.id(), UsersController.sessionOf(token));
		return ResponseEntity.noContent().build();
	}

	/** Anything that isn't 6 digits is simply a wrong code. */
	record CodeRequest(@Size(max = 64) String code) {
	}

	record RecoveryCodesResponse(List<String> recoveryCodes) {
	}

}
