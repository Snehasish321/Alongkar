import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Let's create an optimized script that creates crisp favicons
async function generateFavicons() {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');

  // Load the clean high-resolution source emblem
  const sourceEmblem = path.join(publicDir, 'favicon-removebg-preview.png');
  
  // Get trimmed source
  const trimmedBuffer = await sharp(sourceEmblem)
    .trim({ threshold: 10 })
    .toBuffer();

  const meta = await sharp(trimmedBuffer).metadata();
  console.log('Source emblem trimmed size:', meta.width, 'x', meta.height);

  // Background brand color: Royal Deep Burgundy (#2A0008)
  const bg = { r: 42, g: 0, b: 8, alpha: 1 };
  const goldColor = '#E8C98A';

  // For 32x32:
  // Target inner emblem size: 22x22 inside 32x32 (approx 5px padding on each side)
  const resized32 = await sharp(trimmedBuffer)
    .resize(22, 22, { fit: 'contain' })
    .toBuffer();

  // Create crisp 32x32 PNG
  const favicon32 = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: bg
    }
  })
  .composite([{
    input: resized32,
    gravity: 'center'
  }])
  .sharpen({ sigma: 0.5, m1: 1.0, m2: 2.0 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

  // For 16x16:
  // Target inner emblem size: 12x12 inside 16x16 (2px padding on each side)
  const resized16 = await sharp(trimmedBuffer)
    .resize(12, 12, { fit: 'contain' })
    .toBuffer();

  // Create crisp 16x16 PNG
  const favicon16 = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: bg
    }
  })
  .composite([{
    input: resized16,
    gravity: 'center'
  }])
  .sharpen({ sigma: 0.8, m1: 1.2, m2: 3.0 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

  // For apple-touch-icon / favicon.png (192x192):
  const resized192 = await sharp(trimmedBuffer)
    .resize(136, 136, { fit: 'contain' })
    .toBuffer();

  const favicon192 = await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: bg
    }
  })
  .composite([{
    input: resized192,
    gravity: 'center'
  }])
  .png({ compressionLevel: 9 })
  .toBuffer();

  // Write outputs
  fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), favicon16);
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), favicon32);
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon192);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), favicon192);

  console.log('favicon-16x16.png created:', favicon16.length, 'bytes');
  console.log('favicon-32x32.png created:', favicon32.length, 'bytes');
  console.log('favicon.png created:', favicon192.length, 'bytes');
  console.log('apple-touch-icon.png created:', favicon192.length, 'bytes');
}

generateFavicons().catch(console.error);
