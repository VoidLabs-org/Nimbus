package com.nimbus.api.identity.internal;

import java.util.Arrays;
import java.util.Optional;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** What a User chose to show as their Profile picture. Never choosing is a null, not one of these. */
enum PictureSource {

	UPLOADED("uploaded"), GOOGLE("google"), GITHUB("github"), INITIALS("initials");

	private final String value;

	PictureSource(String value) {
		this.value = value;
	}

	/** The lower-case word the API and the database use. */
	String value() {
		return value;
	}

	/** The option with this word; empty for anything else. */
	static Optional<PictureSource> parse(String value) {
		return Arrays.stream(values()).filter(source -> source.value.equals(value)).findFirst();
	}

	/** The option that shows the picture of this provider's Linked identity; empty for any other word. */
	static Optional<PictureSource> ofProvider(String provider) {
		return parse(provider).filter(source -> source != UPLOADED && source != INITIALS);
	}

	/** Stored as the lower-case word the {@code users_picture_source_check} constraint allows. */
	@Converter
	static class Column implements AttributeConverter<PictureSource, String> {

		@Override
		public String convertToDatabaseColumn(PictureSource source) {
			return source == null ? null : source.value;
		}

		@Override
		public PictureSource convertToEntityAttribute(String value) {
			if (value == null) {
				return null;
			}
			for (var source : values()) {
				if (source.value.equals(value)) {
					return source;
				}
			}
			throw new IllegalStateException("Unknown picture source " + value);
		}

	}

}
