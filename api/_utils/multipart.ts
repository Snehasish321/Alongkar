import busboy from 'busboy';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ParsedImageFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  size: number;
}

export interface ParseResult {
  file?: ParsedImageFile;
  fields: Record<string, string>;
  error?: string;
}

/**
 * Validates the file buffer header / magic bytes to prevent masquerading files.
 */
export function validateImageMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (!buffer || buffer.length < 12) return false;

  const mime = declaredMime.toLowerCase();

  // JPEG magic bytes: FF D8 FF
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (mime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  // WebP magic bytes: 'RIFF' .... 'WEBP'
  if (mime === 'image/webp') {
    const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
    const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
    return isRiff && isWebp;
  }

  // AVIF magic bytes: ftypavif or ftypavis or ftypmif1 in first 32 bytes
  if (mime === 'image/avif') {
    const headerSlice = buffer.subarray(0, Math.min(32, buffer.length)).toString('latin1');
    return (
      headerSlice.includes('ftypavif') ||
      headerSlice.includes('ftypavis') ||
      headerSlice.includes('ftypmif1') ||
      headerSlice.includes('ftypmsf1')
    );
  }

  return false;
}

/**
 * Parses multipart form data from Node HTTP request stream or Web standard Request.
 */
export async function parseMultipartForm(req: any): Promise<ParseResult> {
  const contentType = req.headers?.['content-type'] || req.headers?.['Content-Type'] || '';

  if (!contentType.includes('multipart/form-data')) {
    return {
      fields: {},
      error: 'Invalid Content-Type. Request must be multipart/form-data.',
    };
  }

  // Handle standard Web Request (e.g. if req.formData exists)
  if (typeof req.formData === 'function') {
    try {
      const formData = await req.formData();
      const fields: Record<string, string> = {};
      let file: ParsedImageFile | undefined = undefined;

      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') {
          fields[key] = value;
        } else if (value && typeof value === 'object' && 'arrayBuffer' in value) {
          const blob = value as Blob & { name?: string };
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mimetype = blob.type || 'application/octet-stream';
          const filename = blob.name || 'upload.jpg';

          if (buffer.length > MAX_FILE_SIZE_BYTES) {
            return {
              fields,
              error: `File size exceeds the 10MB limit. Uploaded size: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`,
            };
          }

          if (!ALLOWED_MIME_TYPES.includes(mimetype.toLowerCase() as any)) {
            return {
              fields,
              error: `Unsupported file type: "${mimetype}". Allowed types: JPEG, PNG, WebP, AVIF.`,
            };
          }

          if (!validateImageMagicBytes(buffer, mimetype)) {
            return {
              fields,
              error: `Corrupt or invalid image content for type "${mimetype}".`,
            };
          }

          file = {
            buffer,
            filename,
            mimetype,
            size: buffer.length,
          };
        }
      }

      if (!file) {
        return { fields, error: 'No image file found in the upload request.' };
      }

      return { file, fields };
    } catch (err: any) {
      return { fields: {}, error: err.message || 'Failed to parse form data.' };
    }
  }

  // Handle Node.js IncomingMessage stream (Vite dev server, Vercel Node handler)
  return new Promise<ParseResult>((resolve) => {
    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE_BYTES,
          files: 1,
        },
      });
    } catch (err: any) {
      return resolve({
        fields: {},
        error: `Failed to initialize form parser: ${err.message}`,
      });
    }

    const fields: Record<string, string> = {};
    let parsedFile: ParsedImageFile | null = null;
    let fileError: string | null = null;
    let fileLimitReached = false;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (_name, fileStream, info) => {
      const { filename, mimeType: mimetype } = info;
      const chunks: Buffer[] = [];
      let totalSize = 0;

      const lowerMime = mimetype.toLowerCase();
      if (!ALLOWED_MIME_TYPES.includes(lowerMime as any)) {
        fileError = `Unsupported file type: "${mimetype}". Allowed types: JPEG, PNG, WebP, AVIF.`;
        fileStream.resume(); // Discard remainder
        return;
      }

      fileStream.on('data', (data: Buffer) => {
        chunks.push(data);
        totalSize += data.length;
        if (totalSize > MAX_FILE_SIZE_BYTES) {
          fileLimitReached = true;
        }
      });

      fileStream.on('limit', () => {
        fileLimitReached = true;
      });

      fileStream.on('end', () => {
        if (fileLimitReached) {
          fileError = `File size exceeds the 10MB limit. Uploaded size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`;
          return;
        }

        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          fileError = 'Uploaded file is empty.';
          return;
        }

        if (!validateImageMagicBytes(buffer, lowerMime)) {
          fileError = `Corrupt or invalid image content for type "${mimetype}". The file content does not match the image format.`;
          return;
        }

        parsedFile = {
          buffer,
          filename: filename || 'upload.jpg',
          mimetype: lowerMime,
          size: buffer.length,
        };
      });
    });

    bb.on('error', (err: any) => {
      resolve({ fields, error: `Upload stream error: ${err.message}` });
    });

    bb.on('finish', () => {
      if (fileLimitReached) {
        return resolve({
          fields,
          error: 'File size exceeds the 10MB limit. Please upload an image under 10MB.',
        });
      }

      if (fileError) {
        return resolve({ fields, error: fileError });
      }

      if (!parsedFile) {
        return resolve({
          fields,
          error: 'No image file provided in request. Please select an image file to upload.',
        });
      }

      resolve({ file: parsedFile, fields });
    });

    if (typeof req.pipe === 'function') {
      req.pipe(bb);
    } else {
      resolve({
        fields: {},
        error: 'Unable to read request stream for file upload.',
      });
    }
  });
}
