import sharp, { type Metadata, type OutputInfo } from 'sharp';

export class ImageValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export interface ValidatedImageResult {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64Data: string;
  byteLength: number;
  width: number;
  height: number;
  sanitizedDataUrl: string;
}

export const MAX_IMAGE_INPUT_DATA_URL_CHARS = 360000;
export const MAX_IMAGE_INPUT_BYTES = 260 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 190 * 1024; // Keeps Firestore doc well below 1MB ceiling
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_IMAGE_PIXELS = 16_777_216; // 4096 x 4096 pixel bomb guard

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectMagicMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

const MIME_TO_SHARP_FORMAT: Record<'image/jpeg' | 'image/png' | 'image/webp', string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function validateAndSanitizeImageDataUrl(
  dataUrl: string
): Promise<ValidatedImageResult> {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0 || dataUrl.length > MAX_IMAGE_INPUT_DATA_URL_CHARS) {
    throw new ImageValidationError('Image payload exceeds maximum permitted size.');
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new ImageValidationError(
      'Invalid image format. Only base64 JPEG, PNG, and WEBP images are permitted.'
    );
  }

  const declaredMime = match[1] as 'image/jpeg' | 'image/png' | 'image/webp';
  const rawBase64 = match[2];

  if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
    throw new ImageValidationError('Unsupported image MIME type.');
  }

  const inputBuffer = Buffer.from(rawBase64, 'base64');
  if (inputBuffer.length === 0 || inputBuffer.length > MAX_IMAGE_INPUT_BYTES) {
    throw new ImageValidationError(
      `Compressed image must be between 1 byte and ${Math.round(MAX_IMAGE_INPUT_BYTES / 1024)}KB.`
    );
  }

  // Check binary magic bytes before passing buffer to native image decoder
  const detectedMime = detectMagicMimeType(inputBuffer);
  if (!detectedMime || detectedMime !== declaredMime) {
    throw new ImageValidationError(
      'Image binary signature does not match declared JPEG, PNG, or WEBP format.'
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(inputBuffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
    }).metadata();
  } catch {
    throw new ImageValidationError('Image could not be safely decoded or exceeds pixel limits.');
  }

  if (metadata.format !== MIME_TO_SHARP_FORMAT[detectedMime]) {
    throw new ImageValidationError('Decoded image container does not match binary signature.');
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new ImageValidationError(
      `Image dimensions must be between 1px and ${MAX_IMAGE_DIMENSION}px per edge.`
    );
  }

  if ((metadata.pages ?? 1) > 1) {
    throw new ImageValidationError('Animated or multi-frame images are not permitted.');
  }

  // Re-encode completely in memory with .rotate() (normalizes EXIF orientation)
  // and omit .withMetadata() so EXIF, GPS, XMP, and IPTC metadata are stripped.
  const encode = async (quality: number) => {
    const pipeline = sharp(inputBuffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
    }).rotate();

    if (detectedMime === 'image/jpeg') {
      return pipeline.jpeg({ quality, chromaSubsampling: '4:2:0' }).toBuffer({ resolveWithObject: true });
    }
    if (detectedMime === 'image/webp') {
      return pipeline.webp({ quality }).toBuffer({ resolveWithObject: true });
    }
    return pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  };

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await encode(82);
    if (
      output.data.length > MAX_IMAGE_OUTPUT_BYTES &&
      (detectedMime === 'image/jpeg' || detectedMime === 'image/webp')
    ) {
      output = await encode(60);
    }
  } catch {
    throw new ImageValidationError('Image failed secure re-encoding.');
  }

  if (output.data.length === 0 || output.data.length > MAX_IMAGE_OUTPUT_BYTES) {
    throw new ImageValidationError(
      `Sanitized image exceeds ${Math.round(MAX_IMAGE_OUTPUT_BYTES / 1024)}KB Firestore storage ceiling.`
    );
  }

  const base64Data = output.data.toString('base64');
  return {
    mimeType: detectedMime,
    base64Data,
    byteLength: output.data.length,
    width: output.info.width,
    height: output.info.height,
    sanitizedDataUrl: `data:${detectedMime};base64,${base64Data}`,
  };
}
