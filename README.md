# Portfolio site

Neon sign hero scene. Plain HTML, CSS and JavaScript modules, with no build step. three.js 0.184 loads from unpkg via the import map in `index.html`, the same setup the design was built on.

## Run locally
ES modules and `fetch('content.json')` don't work from `file://`, so serve the folder:
- VS Code: install **Live Server**, right-click `index.html` → *Open with Live Server*
- or a terminal in this folder: `npx serve .`

## Edit content
All text lives in **`content.json`**: the page title and description (`site`) and the sign drawer text (`signs`). Add an optional `"hover"` to a sign to show it as a tooltip when that sign is hovered.

## Files
```
index.html            page structure, hero controls markup
content.json          page title/description and sign drawer text
css/styles.css        all styling; colors are CSS variables at the top
js/main.js            boots everything; SCENE_DEFAULTS sets the scene's starting look
js/render-content.js  applies the page title and description from content.json
js/hero-scene.js      the three.js neon scene (ported unchanged from the design)
js/hero-ui.js         toolbar, settings panel, credit toast, sign drawer
js/scene-base.js      tiny state helper the scene relies on
assets/               SVG sign outlines and sound effects
```

## Deploy (Netlify)
Push to GitHub, then in Netlify: *Add new site → Import from Git*, pick the repo, leave the build command empty, publish directory `.` (already set in `netlify.toml`).

## Credits
Sound effects from Pixabay (https://pixabay.com/sound-effects/). The credit is shown in the hero's info toast. Keep it if you keep the sounds.
