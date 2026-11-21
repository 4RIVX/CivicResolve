import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  ImageValidationError,
  validateAndSanitizeImageDataUrl,
} from '../src/server/utils/imageSecurity';

describe('Phase 4 Security: Sharp Image Sanitization & EXIF/GPS Stripping', () => {
  it('strips EXIF, camera Make/Model, and GPS tags while preserving image readability and orientation', async () => {
    const rawWithExif = await sharp({
      create: { width: 40, height: 24, channels: 3, background: { r: 15, g: 120, b: 220 } },
    })
      .jpeg({ quality: 85 })
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: {
            Make: 'CanonTestCam',
            Model: 'SecretPhoneGPS',
            Software: 'GeotagTracker99',
          },
          IFD3: {
            GPSLatitudeRef: 'N',
            GPSLongitudeRef: 'E',
          },
        },
      })
      .toBuffer();

    const inputMeta = await sharp(rawWithExif).metadata();
    expect(inputMeta.exif).toBeDefined();
    expect(inputMeta.orientation).toBe(6);

    const sanitized = await validateAndSanitizeImageDataUrl(
      `data:image/jpeg;base64,${rawWithExif.toString('base64')}`
    );

    expect(sanitized.mimeType).toBe('image/jpeg');
    // .rotate() applies orientation 6 (90deg) and resets orientation metadata, swapping 40x24 -> 24x40
    expect(sanitized.width).toBe(24);
    expect(sanitized.height).toBe(40);

    const cleanBuffer = Buffer.from(sanitized.base64Data, 'base64');
    const cleanMeta = await sharp(cleanBuffer).metadata();
    expect(cleanMeta.exif).toBeUndefined();
    expect(cleanMeta.xmp).toBeUndefined();
    expect(cleanMeta.iptc).toBeUndefined();
    expect(cleanMeta.orientation).toBeUndefined();
    expect(cleanBuffer.toString('latin1')).not.toContain('CanonTestCam');
    expect(cleanBuffer.toString('latin1')).not.toContain('SecretPhoneGPS');
    expect(cleanBuffer.toString('latin1')).not.toContain('GeotagTracker99');
  });

  it('keeps valid JPEG, PNG, and WEBP uploads viewable with exact dimensions', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const buf = await sharp({
        create: { width: 32, height: 20, channels: 3, background: { r: 220, g: 90, b: 40 } },
      })
        [format]()
        .toBuffer();

      const mime = `image/${format}` as const;
      const result = await validateAndSanitizeImageDataUrl(
        `data:${mime};base64,${buf.toString('base64')}`
      );
      expect(result.mimeType).toBe(mime);
      expect(result.width).toBe(32);
      expect(result.height).toBe(20);
      expect(result.byteLength).toBeGreaterThan(20);
    }
  });

  it('rejects animated/multi-frame WEBP, pixel bombs, SVG/HTML, MIME spoofing, and malformed bytes', async () => {
    // 1. Genuine 2-frame animated WEBP (VP8X animation bit + ANIM + 2 ANMF frames)
    const f1 = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .webp()
      .toBuffer();
    const f2 = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .webp()
      .toBuffer();
    const riffChunk = (fourcc: string, payload: Buffer) => {
      const pad = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
      const hdr = Buffer.alloc(8);
      hdr.write(fourcc, 0, 'ascii');
      hdr.writeUInt32LE(payload.length, 4);
      return Buffer.concat([hdr, payload, pad]);
    };
    const vp8xPayload = Buffer.alloc(10);
    vp8xPayload[0] = 0x02;
    vp8xPayload.writeUIntLE(7, 4, 3);
    vp8xPayload.writeUIntLE(7, 7, 3);
    const animPayload = Buffer.alloc(6);
    const mkAnmf = (vp8Chunk: Buffer) => {
      const hdr = Buffer.alloc(16);
      hdr.writeUIntLE(7, 6, 3);
      hdr.writeUIntLE(7, 9, 3);
      hdr.writeUIntLE(100, 12, 3);
      return riffChunk('ANMF', Buffer.concat([hdr, vp8Chunk]));
    };
    const animatedWebp = riffChunk(
      'RIFF',
      Buffer.concat([
        Buffer.from('WEBP', 'ascii'),
        riffChunk('VP8X', vp8xPayload),
        riffChunk('ANIM', animPayload),
        mkAnmf(f1.subarray(12)),
        mkAnmf(f2.subarray(12)),
      ])
    );
    const animMeta = await sharp(animatedWebp).metadata();
    expect(animMeta.pages ?? 1).toBeGreaterThan(1);
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/webp;base64,${animatedWebp.toString('base64')}`)
    ).rejects.toThrow(ImageValidationError);

    // 2. SVG / GIF / HTML disguised with JPEG header or MIME
    const svgBase64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/svg+xml;base64,${svgBase64}`)
    ).rejects.toThrow(ImageValidationError);
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/png;base64,${svgBase64}`)
    ).rejects.toThrow(ImageValidationError);

    const gifBytes = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'ascii');
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/jpeg;base64,${gifBytes.toString('base64')}`)
    ).rejects.toThrow(ImageValidationError);

    // 3. MIME mismatch (PNG bytes labeled as image/jpeg)
    const realPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/jpeg;base64,${realPng.toString('base64')}`)
    ).rejects.toThrow(ImageValidationError);

    // 4. Pixel dimension exceeding MAX_IMAGE_DIMENSION (4096px)
    const tooWidePng = await sharp({
      create: { width: 4200, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/png;base64,${tooWidePng.toString('base64')}`)
    ).rejects.toThrow(ImageValidationError);

    // 5. Corrupt JPEG magic bytes with garbage body
    const corruptJpg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from('CORRUPTED_DATA_NOT_VALID_JPEG_STREAM'),
    ]);
    await expect(
      validateAndSanitizeImageDataUrl(`data:image/jpeg;base64,${corruptJpg.toString('base64')}`)
    ).rejects.toThrow(ImageValidationError);
  });
});
