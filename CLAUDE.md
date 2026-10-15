# Project notes for Claude

Static portfolio site deployed to Netlify from git. **No build step, no npm, no framework.** Keep it that way unless asked.

## Where things live
- Copy: `content.json` only (page title/description and sign drawer text). When asked to change text, edit this file and nothing else.
- The page is just the hero; there are no portfolio sections below it.
- Styling: `css/styles.css`. Colors are CSS variables in `:root`. Sign colors must match the hex values in `js/hero-scene.js` (`defs` and `signInfo`).
- Hero scene: `js/hero-scene.js` is a three.js scene ported verbatim from the original design. Treat it as tuned. Change only what's asked and keep its `this.state` / `this.props` / `this.setState` usage (provided by `js/scene-base.js`).
- Sign layout: each sign has a `.sign-cell` in the flex-wrap `.sign-grid` (`index.html` / `css/styles.css`). The scene measures the cells and draws each sign at its cell's center, so layout changes belong in CSS, not in the scene.
- Scene settings UI: markup in `index.html`, behavior in `js/hero-ui.js`.

## Conventions
- three.js is pinned to 0.184.0 via the import map in `index.html`. Bump every URL together.
- Assets are referenced as `assets/<file>`.
- Visual language: near-black background `#050307`, panels `#0b0810`, hairlines `#1c1626` / `#2a2338`, Helvetica, small uppercase labels with letter-spacing, neon accents from the sign colors, magenta `#ff35d6` for primary/active states.
- Keep the Pixabay sound credit in the info toast.
- Test locally with Live Server or `npx serve .` (modules don't load from file://).
