package com.nimbus.api.identity.internal;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** What a User chose to show as their Profile picture. Never choosing is a null, not one of these. */
enum PictureSource {

	UPLOADED("uploaded"), GOOGLE("google"), GITHUB("github"), INITIALS("initials");

	private final String value;

	PictureSource(String value) {
		this.value = value;
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
