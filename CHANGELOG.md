# Changelog

All notable changes to the Alongkar Luxury Jewellery application are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### [Iteration 12] - Centered Everyday Elegance Tag with BlurReveal - 2026-09-21
#### Added
- **Spell UI BlurReveal Component (`src/components/ui/BlurReveal.tsx`)**: Created the exact official Spell UI text effect component utilizing `framer-motion`:
  - Character-by-character and word-by-word segmented stagger animation with progressive Gaussian blur dissipation (`filter: blur(12px) -> blur(0px)`), opacity fade-in, and subtle y-axis translation.
  - Fully parameterized with `delay`, `speedReveal`, `speedSegment`, `letterSpacing`, and customizable semantic HTML tag wrapper (`as="span"`, `p`, etc.).
  - Added export compatibility at `src/components/blur-reveal.tsx`.
- **Centered Luxury "Everyday Elegance" Tag (`src/components/home/HeroSection.tsx`)**:
  - Positioned exactly in the center of the viewport atop the animated Blossom Sky WebGL canvas.
  - Frosted luxury glass capsule design with multi-layer backdrop blur (`backdrop-blur-xl`), luminous inner border reflection, and ambient lavender/rose glow aura.
  - Playfair Display editorial serif typography (`tracking-[0.24em] uppercase font-semibold text-[#2A1E27]`) with delicate flanking sparkle accents.
  - Smooth page-load entrance animation: badge rises and scales gracefully into view while the text softly reveals into sharp focus.

### [Iteration 11] - Blossom Sky WebGL Background Animation - 2026-09-21
#### Added
- **BlossomSky WebGL Component (`src/components/ui/BlossomSky.tsx`)**: Built a full GPU-accelerated WebGL shader engine executing the exact FeralUI `type: "sky"` algorithm for the "Blossom sky" preset:
  - 4-Color Palette: Rose Rice (`#FFEFF6`), Wisteria Mist (`#F2C4DC`), Plum Smoke (`#C9A6E8`), and Clear Hanada (`#7E8FD0`).
  - Native GLSL simplex/cnoise warping, FBM wave turbulence (`fbm4`), multi-layer liquid drift, and custom burn color-blending equations.
  - Configured with `speed: 22`, dynamic noise generation, and responsive full-screen WebGL viewport.
#### Changed
- **Hero Background Replacement**: Replaced the previous Garnet Silk prism canvas with the new **Blossom Sky** WebGL animation in `HeroSection.tsx`.

### [Iteration 10] - Exact FeralUI PRISM2 Engine Implementation - 2026-09-21
#### Added
- **Native FeralUI PRISM2 Algorithm**: Extracted and ported FeralUI's mathematical engine directly into `src/components/ui/GarnetSilkPrism.tsx`:
  - Perceptual **Oklab Color Space** interpolation (`rgbToOklab`, `oklabToRgb`, `blendOklab`) for smooth gradients without muddiness.
  - Symmetrical 24-slat array generated with `shape: "crest"`, `height: 60`, `focus: 50`, `position: 50`, `blend: 65`, and `facets: 35`.
  - Exact normalized transformation matrix (`getTransformMatrix`) and 96-stop linear gradient per slat.
  - Natural `motion: "expand"` speed-40 sine undulation and 2% film grain noise overlay.
#### Result
- The full-screen hero canvas is now 100% pixel-faithful and mathematically identical to the FeralUI reference image.

### [Iteration 9] - Isolated Fullscreen Garnet Silk Background - 2026-09-21
#### Removed
- **Navbar & Announcement Bar**: Completely removed header navigation and announcement bar from the layout.
- **Hero Foreground Elements**: Stripped away all headlines, subtext, CTA buttons, badges, and the spotlight jewelry card.
- **Global Footer & Drawers**: Removed footer, cart drawer, wishlist drawer, and mobile menu overlays from the active shell.
#### Changed
- **Pure Fullscreen Background**: The application now displays exclusively the animated **Garnet Silk Prism** canvas edge-to-edge across the entire viewport (`100vw` × `100vh`) as the foundational canvas to build upon one by one.

### [Iteration 8] - Pure Garnet Silk Canvas (Removed Overlays) - 2026-09-21
#### Removed
- **Dark Gradient Scrims**: Removed `bg-gradient-to-b` and vignette layers over the hero canvas.
- **Filigree SVG Rings**: Removed the geometric circular ornament overlay.
- **Sparkle Particles**: Removed floating particle dust over the silk backdrop.
- **Card Halo**: Removed the blurred glow layer behind the jewelry card.
#### Changed
- **Direct Canvas Exposure**: The animated Garnet Silk Prism canvas is now 100% uncovered and clean.
- **Arch Geometry**: Calibrated the vertical gradient boundaries in `GarnetSilkPrism.tsx` so the bottom center reveals the pure Rose Rice (`#F4D4CE`) arch rising through the cathedral columns.

### [Iteration 7] - Clean Slate & Focused Garnet Silk Hero Baseline - 2026-09-21
#### Changed
- **HomePage Isolation**: Stripped away all secondary home page sections (Categories, Trending, Curated Collections, Story, Trust Pillars, Customer Stories, Social Gallery) to provide a clean, uncluttered baseline centered entirely around the animated hero section.
- **Hero Presentation Polish**: Adjusted vignette overlays to ensure the full cathedral arch glow of Rose Rice (`#F4D4CE`) and fluted columns from the Garnet Silk JSON shine with high visibility and contrast.
- **Incremental Workflow**: Established the focused hero as Step 1, ready to introduce and tune subsequent sections one by one per user direction.

### [Iteration 6] - Garnet Silk Prism Hero Section - 2026-09-21
#### Added
- **GarnetSilkPrism Component (`src/components/ui/GarnetSilkPrism.tsx`)**: Created a dedicated, high-performance canvas engine implementing FeralUI's "Garnet silk" prism gradient:
  - Exact palette stops: Midnight Plum (`#491D36`), Dusk Wisteria (`#893C64`), Sappan Rose (`#C3758F`), Coral Glaze (`#E1A4AF`), and Rose Rice (`#F4D4CE`).
  - Arched fluted vertical prism column structure with 2% film grain noise overlay and gentle speed-40 undulation.
- **Hero Section Background**: Deployed the animated Garnet Silk Prism backdrop directly to `HeroSection.tsx` with high-contrast text shadows, gold leaf typography, and seamless dark vignette transitions.

### [Iteration 5] - Trust Pillars, Patron Reflections & Royal Footer - 2026-09-21
#### Changed
- **Why Alongkar (Trust Pillars)**: Elevated with 4 distinct royal hallmark steps (24K Micron Gold Bond, Heirloom Anti-Tarnish, Insured Express Transit, Handcrafted Heritage) equipped with watermark step numerals (`01`-`04`) and gold border halos.
- **Customer Stories**: Redesigned patron review cards with verified buyer seals, monogram avatar medallions, gold quotation marks, and direct link badges to reviewed jewellery.
- **Footer**: Overhauled layout with rich `#140104` Bordeaux Noir velvet palette, VIP newsletter sign-up with immediate feedback, curated atelier quick-links, and 100% encrypted checkout guarantee chips.

### [Iteration 4] - Curated Categories & High-Jewellery Product Experience - 2026-09-21
#### Changed
- **Category Showcase**: Re-engineered category grid with arched silhouettes (`rounded-t-[28px]`), deep Bordeaux vignette overlays, gold arrow badge highlights, and smooth zoom effects.
- **Product Card Architecture**: Completely overhauled `ProductCard.tsx` with:
  - Pure white silk card aesthetic accented with delicate antique gold perimeter borders.
  - Floating pill badges for Bestseller, New Arrival, and Discount Percentages.
  - Heartbeat micro-animation on wishlist toggling.
  - Dual-photograph crossfade transition with subtle luxury vignette.
  - Floating frosted action bar for quick inspection.
- **Trending Section**: Enhanced category filter pill tabs with active gold indicator badges, subtle counts, and royal vault exploration CTA.

### [Iteration 3] - Dramatic Hero Split Showcase & Atelier Brand Story - 2026-09-21
#### Changed
- **Hero Section**: Replaced standard centered hero with a high-impact editorial split layout:
  - Shimmering gold foil typography (`.text-gold-leaf`) paired with atelier prestige badge.
  - Interactive "Discover The Atelier" and "Curated Edits" gold buttons with smooth hover transitions.
  - Live trust badges highlighting 24K Micron Gold, Hypoallergenic core, and heirloom hand-set stones.
  - Floating spotlight masterpiece card featuring The Rajwada Kundan Choker with gold ambient halo.
- **Brand Story Section**: Transformed story section into a luxury atelier tribute featuring:
  - Archival photo frame with gold trim and craftsman quote overlay.
  - 3 foundational craft pillars: Handcrafted Filigree Core, 24K Micron Electroplating, and Heirloom Finish Guarantee.
  - Verified atelier metrics and refined story narrative.

### [Iteration 2] - Luxury Navigation & Announcement Bar Overhaul - 2026-09-21
#### Changed
- **Announcement Bar**: Converted static top ribbon into an interactive auto-rotating announcement showcase featuring trust seals, free delivery triggers, and an interactive 1-click copyable `ROYAL10` discount code.
- **Navbar**: Redesigned header with luxury glassmorphism (`backdrop-blur-xl`), gold perimeter hairline borders, glowing indicator highlights, command-search pill with `⌘K` badge, and VIP gold action buttons.
- **Mobile Menu**: Overhauled mobile slide-over navigation with dark Bordeaux Noir velvet background, quick category luxury tile grid, and authenticated VIP member state badges.

### [Iteration 1] - Design Foundation & Changelog Initialized - 2026-09-21
#### Added
- Created `CHANGELOG.md` to track iterative UI/UX transformation progress.
- Enhanced luxury styling tokens in `src/index.css` including:
  - Deep Bordeaux Noir & Royal Velvet palette (`--color-ak-burgundy-noir`, `--color-ak-burgundy-velvet`).
  - Champagne Gold Shimmer & Gold Leaf gradient presets (`.text-gold-leaf`, `.bg-gold-metallic`).
  - Glassmorphic luxury container styles with subtle gold border halos (`.glass-luxury`, `.border-gold-subtle`).
  - Ambient jewel backlight effects for hero spotlighting (`.ambient-gold-glow`).
