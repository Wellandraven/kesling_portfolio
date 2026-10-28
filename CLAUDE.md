# Project notes for Claude

Static portfolio site deployed to Netlify from git. **No build step, no npm, no framework.** Keep it that way unless asked.

## Where things live
- Copy: `content.json` only (page title/description, sign drawer text, and `projects` case-study cards). When asked to change text, edit this file and nothing else.
- The page is just the hero; there are no portfolio sections below it.
- Styling: `css/styles.css`. Colors are CSS variables in `:root`. Sign colors must match the hex values in `js/hero-scene.js` (`defs` and `signInfo`).
- Hero scene: `js/hero-scene.js` is a three.js scene ported verbatim from the original design. Treat it as tuned. Change only what's asked and keep its `this.state` / `this.props` / `this.setState` usage (provided by `js/scene-base.js`).
- Sign layout: each sign has a `.sign-cell` in the CSS grid `.sign-grid` (`index.html` / `css/styles.css`): 3×2, or 2×3 in portrait. The stage fills the viewport under the toolbar and the cells shrink to fit it, clamped between 146×110 (≈80px signs; below that the page scrolls) and 400×300. The scene measures the cells and draws each sign at its cell's center, sized from the largest 4:3 box inside the cell, so layout changes belong in CSS, not in the scene. The toolbar's `.toolbar-nav` holds a `.sign-label` button per sign (text = the sign's `title`) that opens its drawer; it's the keyboard/screen-reader way in, since the canvas is mouse/touch only. On narrow screens (≤720px) `.toolbar-nav` is hidden and becomes a bottom sheet opened by the `.menu-btn` hamburger (`menuOpen` in `scene.state`, wired in `js/hero-ui.js`). The sheet and its backdrop sit above the sign drawer (z 9/8 vs 7/6) so visitors can jump between sections without closing the drawer; the open section's label gets `aria-current`. Hovering/focusing a label sets `scene._labelHover`, which the tick loop treats like hovering that sign (gated by the Hover reactions switch).
- Scene settings UI: markup in `index.html`, behavior in `js/hero-ui.js`.

## Conventions
- three.js is pinned to 0.184.0 via the import map in `index.html`. Bump every URL together.
- Assets are referenced as `assets/<file>`.
- Visual language: near-black background `#050307`, panels `#0b0810`, hairlines `#1c1626` / `#2a2338`, Plus Jakarta Sans (labels/headings, `--font-display`) + Inter (body, `--font`) loaded from Google Fonts, small uppercase labels with letter-spacing, neon accents from the sign colors, magenta `#ff35d6` for primary/active states.
- Keep the Pixabay sound credit in the info toast.
- Test locally with Live Server or `npx serve .` (modules don't load from file://).
