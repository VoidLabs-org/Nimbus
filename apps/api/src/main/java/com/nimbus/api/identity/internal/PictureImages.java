package com.nimbus.api.identity.internal;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;

/**
 * Turns an uploaded file into the stored Profile picture: a 256x256 JPEG of its centred square, transparency laid on
 * white. The JPEG is written fresh, so nothing of the original's metadata (EXIF, location) is kept.
 */
final class PictureImages {

	static final int SIZE = 256;

	static final String CONTENT_TYPE = "image/jpeg";

	/** Larger images are refused before they're decoded: a small PNG can unpack into gigabytes. */
	private static final long MAX_PIXELS = 50_000_000;

	/**
	 * Images are decoded at no more than about this many pixels (2048x2048, 16 MB), skipping pixels while reading a
	 * larger one. Plenty for a 256-pixel result, and it keeps parallel uploads of large photos from filling the heap.
	 */
	private static final double DECODED_PIXELS = 2048.0 * 2048.0;

	private static final float QUALITY = 0.85f;

	private static final byte[] JPEG = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF };

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n' };

	private static final byte[] RIFF = { 'R', 'I', 'F', 'F' };

	private static final byte[] WEBP = { 'W', 'E', 'B', 'P' };

	private PictureImages() {
	}

	/**
	 * @throws UnsupportedTypeException when the file's bytes aren't a JPEG, PNG or WebP, whatever its name or type
	 * says
	 * @throws UnreadableImageException when it starts like one but can't be decoded
	 */
	static byte[] toProfilePicture(byte[] file) {
		if (!startsWith(file, 0, JPEG) && !startsWith(file, 0, PNG)
				&& !(startsWith(file, 0, RIFF) && startsWith(file, 8, WEBP))) {
			throw new UnsupportedTypeException();
		}
		return encode(square(decode(file)));
	}

	private static BufferedImage decode(byte[] file) {
		try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(file))) {
			var readers = ImageIO.getImageReaders(input);
			if (!readers.hasNext()) {
				throw new UnreadableImageException();
			}
			ImageReader reader = readers.next();
			try {
				reader.setInput(input, true, true);
				var pixels = (long) reader.getWidth(0) * reader.getHeight(0);
				if (pixels > MAX_PIXELS) {
					throw new UnreadableImageException();
				}
				var params = reader.getDefaultReadParam();
				var step = (int) Math.max(1, Math.ceil(Math.sqrt(pixels / DECODED_PIXELS)));
				params.setSourceSubsampling(step, step, 0, 0);
				return reader.read(0, params);
			}
			finally {
				reader.dispose();
			}
		}
		catch (IOException | RuntimeException e) {
			if (e instanceof UnreadableImageException unreadable) {
				throw unreadable;
			}
			// Decoders throw all sorts for broken files (IllegalArgumentException, IndexOutOfBounds, ...).
			throw new UnreadableImageException();
		}
	}

	/** The centred square, scaled to {@link #SIZE} on white. */
	private static BufferedImage square(BufferedImage image) {
		var side = Math.min(image.getWidth(), image.getHeight());
		var current = image.getSubimage((image.getWidth() - side) / 2, (image.getHeight() - side) / 2, side, side);
		// Halving step by step keeps a large photo smooth; one big jump to 256 would alias.
		while (current.getWidth() >= SIZE * 2) {
			current = draw(current, current.getWidth() / 2);
		}
		return draw(current, SIZE);
	}

	private static BufferedImage draw(BufferedImage source, int size) {
		var target = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
		var graphics = target.createGraphics();
		try {
			graphics.setColor(Color.WHITE);
			graphics.fillRect(0, 0, size, size);
			graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
			graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
			graphics.drawImage(source, 0, 0, size, size, null);
		}
		finally {
			graphics.dispose();
		}
		return target;
	}

	private static byte[] encode(BufferedImage image) {
		var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
		var out = new ByteArrayOutputStream();
		try (var output = ImageIO.createImageOutputStream(out)) {
			writer.setOutput(output);
			var params = writer.getDefaultWriteParam();
			params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
			params.setCompressionQuality(QUALITY);
			writer.write(null, new IIOImage(image, null, null), params);
		}
		catch (IOException e) {
			throw new IllegalStateException("Could not write a JPEG", e);
		}
		finally {
			writer.dispose();
		}
		return out.toByteArray();
	}

	private static boolean startsWith(byte[] file, int offset, byte[] prefix) {
		return file.length >= offset + prefix.length
				&& Arrays.equals(file, offset, offset + prefix.length, prefix, 0, prefix.length);
	}

	/** Not a JPEG, PNG or WebP. */
	static class UnsupportedTypeException extends RuntimeException {

		UnsupportedTypeException() {
			super("Upload a JPEG, PNG or WebP");
		}

	}

	/** Looks like a JPEG, PNG or WebP but can't be decoded, or is far too large to. */
	static class UnreadableImageException extends RuntimeException {

		UnreadableImageException() {
			super("This image can't be read");
		}

	}

}
