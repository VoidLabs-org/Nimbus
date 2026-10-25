package com.nimbus.api.identity.internal;

import java.io.IOException;

import com.nimbus.api.identity.CurrentUser;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
class ProfilePictureController {

	/** Every upload gets a new key, so what is served under one never changes. */
	private static final String FOREVER = "public, max-age=31536000, immutable";

	private final ProfilePictures pictures;

	private final UserRepository users;

	private final CurrentUser currentUser;

	private final Sessions sessions;

	ProfilePictureController(ProfilePictures pictures, UserRepository users, CurrentUser currentUser,
			Sessions sessions) {
		this.pictures = pictures;
		this.users = users;
		this.currentUser = currentUser;
		this.sessions = sessions;
	}

	/** Uploads the User's photo (one {@code file} part) and shows it; needs a running Session. Answers with the User. */
	@PutMapping(path = "/api/users/me/profile-picture", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	UserResponse upload(@AuthenticationPrincipal Jwt token, @RequestPart("file") MultipartFile file)
			throws IOException {
		var user = users.require(currentUser.id());
		sessions.requireActive(UsersController.sessionOf(token), user.getId());
		if (file.getSize() > ProfilePictures.MAX_UPLOAD_BYTES) {
			// Before reading it into memory.
			throw new ProfilePictures.FileTooLargeException();
		}
		return UserResponse.from(pictures.upload(user.getId(), file.getBytes()), pictures);
	}

	/** An uploaded photo, for anyone with its address: {@code <img>} tags send no access token. */
	@GetMapping("/api/profile-pictures/{key}")
	ResponseEntity<InputStreamResource> picture(@PathVariable String key) {
		return pictures.read(key)
			.map(object -> ResponseEntity.ok()
				.header(HttpHeaders.CACHE_CONTROL, FOREVER)
				.contentType(MediaType.parseMediaType(object.contentType()))
				.contentLength(object.length())
				// Spring closes the stream once it has been sent.
				.body(new InputStreamResource(object.content())))
			.orElseGet(() -> ResponseEntity.notFound().build());
	}

}
