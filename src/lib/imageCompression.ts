const ALLOWED_INPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RAW_FILE_BYTES = 10 * 1024 * 1024; // 10MB pre-compression limit
const MAX_COMPRESSED_DATA_URL_LENGTH = 240000; // Well within 260KB Firestore-safe ceiling

export interface CompressedImageOutcome {
  dataUrl: string;
  mimeType: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
}

export async function compressImageFile(file: File): Promise<CompressedImageOutcome> {
  if (!ALLOWED_INPUT_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP image files are accepted.');
  }
  if (file.size <= 0 || file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Image file must be smaller than 10MB.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image file.'));
      el.src = imageUrl;
    });

    const maxDim = 960;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas compression is unavailable.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    const targetMime = file.type === 'image/png' ? 'image/jpeg' : file.type;
    let quality = 0.78;
    let dataUrl = canvas.toDataURL(targetMime, quality);

    while (dataUrl.length > MAX_COMPRESSED_DATA_URL_LENGTH && quality > 0.35) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > MAX_COMPRESSED_DATA_URL_LENGTH) {
      throw new Error('Compressed photograph is still too large for Firestore document storage. Please select a smaller image.');
    }

    const base64Part = dataUrl.split(',')[1] ?? '';
    const compressedBytes = Math.round((base64Part.length * 3) / 4);
    const outMime = dataUrl.slice(5, dataUrl.indexOf(';'));

    return {
      dataUrl,
      mimeType: outMime,
      originalBytes: file.size,
      compressedBytes,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
