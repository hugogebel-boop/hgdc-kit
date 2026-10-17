---
"@hgdc/ui": minor
---

Product icons sit on a white background, in light and dark alike, with no border or shadow: `ProductBadge` draws a white squircle by default and a white circle with `shape="round"` (« Propulsé par »). `PRODUCT_BADGE_SVG[word]` becomes `{ squircle, round }`, new `BadgeShape` type. `family/tile/` ships the tiles (`<word>.svg`, `-round.svg`, `-favicon.svg` with 22 % corners); `family/app/<word>/` now holds the favicon on a 22 % rounded square, apple-touch and maskable full-bleed white, icon-192/512 as squircles. Email icons are squircles. The H « Double » keeps no background.
