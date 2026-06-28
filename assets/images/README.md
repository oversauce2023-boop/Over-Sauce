# /assets/images

This project references food photography via hotlinked Unsplash URLs
directly in `/data/products.json` and `index.html` (hero, story section).
This keeps the deliverable lightweight and avoids bundling large binary
files in version control.

## Moving to local/owned photography

When the restaurant has its own professional photos:

1. Drop the final images in this folder (recommended: `.jpg` or `.webp`,
   max ~150KB each, 900px wide is plenty for the card sizes used here).
2. Update the `"image"` field for each product in `/data/products.json`
   to a relative path, e.g. `"image": "assets/images/mixed-grill.jpg"`.
3. Update the hero image `src` in `index.html` (`#heroImg`) and the
   "Our Story" section image the same way.
4. Add the new filenames to `SHELL_ASSETS` in `service-worker.js` if you
   want them pre-cached for offline use (recommended for the hero image
   and any "featured" product photos).

No code changes are required beyond updating these paths — every image
tag already uses `loading="lazy"` and `decoding="async"`, and the CSS
`object-fit: cover` rules will handle any reasonable aspect ratio.
