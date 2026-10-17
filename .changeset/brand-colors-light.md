---
"@hgdc/ui": minor
---

Product colours follow the site's final palette (host `#3b7bff → #2b63f2`, mail `#fa3a58 → #ec3052`, status `#11ce8b → #09b077`, account `#ff6a3d → #fc582e`, analytics `#ffb020 → #e58309`, docs `#0ec1dc → #0aa3c1`, portal `#8b5cff → #7b4bf7`): `family/` is copied byte for byte from the site, tiles, app icons, email icons, `PRODUCT_GRADIENT` and `--product-*` tokens regenerated; the Account pictogram is the new cut-out avatar. Light stays the default theme when nothing is chosen, and `<meta name="theme-color">` now follows the app's theme instead of the system's (`THEME_COLOR`, rewritten by the anti-flash script and `ThemeProvider`): a dark system no longer paints a dark browser bar over a light page.
