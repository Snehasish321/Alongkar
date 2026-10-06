import {
  getOptimizedImageUrl,
  getResponsiveSrcSet,
  isCloudinaryUrl,
  isUnsplashUrl,
  IMAGE_PRESETS,
} from '../src/lib/image.js';

async function runPhase1HTests() {
  console.log('====================================================');
  console.log('PHASE 1H: CLOUDINARY & IMAGE OPTIMIZATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // --- 1. Cloudinary URL Detection ---
  console.log('--- 1. Cloudinary URL Detection ---');
  const cloudUrl1 = 'https://res.cloudinary.com/alongkar-cloud/image/upload/v1710000000/alongkar/products/necklace_gold.jpg';
  const cloudUrl2 = 'https://res.cloudinary.com/alongkar-cloud/image/upload/f_auto,q_auto/alongkar/products/necklace_gold.jpg';
  const unsplashUrl = 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop';
  const localUrl = '/hero-campaign.webp';

  assert(isCloudinaryUrl(cloudUrl1), 'Detects standard Cloudinary delivery URL');
  assert(isCloudinaryUrl(cloudUrl2), 'Detects transformed Cloudinary delivery URL');
  assert(!isCloudinaryUrl(unsplashUrl), 'Rejects Unsplash URL as Cloudinary');
  assert(!isCloudinaryUrl(localUrl), 'Rejects local asset as Cloudinary');
  assert(isUnsplashUrl(unsplashUrl), 'Detects Unsplash URL correctly');

  // --- 2. Cloudinary Transformation Injection ---
  console.log('\n--- 2. Cloudinary Transformation Injection ---');
  const optimizedCard = getOptimizedImageUrl(cloudUrl1, IMAGE_PRESETS.CARD);
  assert(
    optimizedCard.includes('/image/upload/f_auto,q_auto,w_600,c_limit/v1710000000/alongkar/products/necklace_gold.jpg'),
    'Applies f_auto, q_auto, w_600, c_limit to unversioned/versioned Cloudinary URL',
    optimizedCard
  );

  const optimizedThumb = getOptimizedImageUrl(cloudUrl1, IMAGE_PRESETS.THUMB_SM);
  assert(
    optimizedThumb.includes('/image/upload/f_auto,q_auto,w_120,h_120,c_fill/v1710000000/alongkar/products/necklace_gold.jpg'),
    'Applies exact width, height, and c_fill crop for small thumbnail preset',
    optimizedThumb
  );

  const optimizedHero = getOptimizedImageUrl(cloudUrl1, IMAGE_PRESETS.DETAIL_HERO);
  assert(
    optimizedHero.includes('/image/upload/f_auto,q_auto,w_1000,c_limit/v1710000000/alongkar/products/necklace_gold.jpg'),
    'Applies high-res w_1000, c_limit for product detail hero preset',
    optimizedHero
  );

  // --- 3. Duplicate Transformation Prevention ---
  console.log('\n--- 3. Duplicate Transformation Prevention ---');
  const alreadyTransformed = 'https://res.cloudinary.com/alongkar-cloud/image/upload/f_auto,q_auto/v1710000000/alongkar/products/ring.jpg';
  const reTransformed = getOptimizedImageUrl(alreadyTransformed, IMAGE_PRESETS.THUMB_MD);
  assert(
    !reTransformed.includes('f_auto,q_auto/f_auto,q_auto') &&
    reTransformed.includes('/image/upload/f_auto,q_auto,w_200,h_240,c_fill/v1710000000/alongkar/products/ring.jpg'),
    'Replaces existing transformation segment without stacking duplicates',
    reTransformed
  );

  // --- 4. Unsplash Transformation Handling ---
  console.log('\n--- 4. Unsplash URL Optimization ---');
  const optUnsplashThumb = getOptimizedImageUrl(unsplashUrl, IMAGE_PRESETS.THUMB_SM);
  assert(
    optUnsplashThumb.includes('w=120') && optUnsplashThumb.includes('h=120') && optUnsplashThumb.includes('fit=crop'),
    'Optimizes Unsplash URL dimensions for thumbnail display',
    optUnsplashThumb
  );

  const optUnsplashBanner = getOptimizedImageUrl(unsplashUrl, IMAGE_PRESETS.BANNER);
  assert(
    optUnsplashBanner.includes('w=1400') && optUnsplashBanner.includes('auto=format'),
    'Optimizes Unsplash URL dimensions for editorial banner display',
    optUnsplashBanner
  );

  // --- 5. Responsive srcSet Generation ---
  console.log('\n--- 5. Responsive srcSet Generation ---');
  const srcSetCloud = getResponsiveSrcSet(cloudUrl1, [320, 480, 600, 800]);
  assert(
    srcSetCloud.includes('w_320,c_limit') &&
    srcSetCloud.includes('320w') &&
    srcSetCloud.includes('w_800,c_limit') &&
    srcSetCloud.includes('800w'),
    'Generates standard responsive srcSet for Cloudinary assets',
    srcSetCloud
  );

  const srcSetUnsplash = getResponsiveSrcSet(unsplashUrl, [320, 640]);
  assert(
    srcSetUnsplash.includes('w=320') &&
    srcSetUnsplash.includes('320w') &&
    srcSetUnsplash.includes('w=640') &&
    srcSetUnsplash.includes('640w'),
    'Generates standard responsive srcSet for Unsplash assets',
    srcSetUnsplash
  );

  // --- 6. Local & Fallback Pass-through ---
  console.log('\n--- 6. Local & Fallback Pass-through ---');
  assert(getOptimizedImageUrl(localUrl, IMAGE_PRESETS.CARD) === localUrl, 'Preserves local WebP asset unmodified');
  assert(getOptimizedImageUrl('data:image/png;base64,123') === 'data:image/png;base64,123', 'Preserves data URIs unmodified');
  assert(getOptimizedImageUrl(null) === '', 'Handles null gracefully');
  assert(getOptimizedImageUrl(undefined) === '', 'Handles undefined gracefully');

  // --- 7. In-Memory Cache Performance & Consistency ---
  console.log('\n--- 7. In-Memory Cache Performance & Consistency ---');
  const t0 = performance.now();
  for (let i = 0; i < 5000; i++) {
    getOptimizedImageUrl(cloudUrl1, IMAGE_PRESETS.CARD);
  }
  const t1 = performance.now();
  const durationMs = t1 - t0;
  assert(durationMs < 50, `5,000 cached transformations execute in < 50ms (actual: ${durationMs.toFixed(2)}ms)`);

  console.log('\n====================================================');
  console.log(`PHASE 1H TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1HTests().catch((err) => {
  console.error('Fatal error in Phase 1H test:', err);
  process.exit(1);
});
