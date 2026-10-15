import { HeroScene } from './hero-scene.js';
import { mountHeroUI } from './hero-ui.js';
import { renderContent } from './render-content.js';
import { mountAdmin } from './admin.js';

// Starting look of the scene (visitors can change these in the settings panel).
const SCENE_DEFAULTS = { bloomStrength: 1.6, fogDensity: 0.6, flickerAmount: 0.4, mouseReact: true };

const content = await fetch('content.json').then((r) => r.json());
renderContent(content);

const scene = new HeroScene(SCENE_DEFAULTS);
// sign drawer copy comes from content.json; colors stay with the signs in hero-scene.js
for (const [key, info] of Object.entries(content.signs || {})) {
  if (scene.signInfo[key]) scene.signInfo[key] = { ...scene.signInfo[key], ...info };
}
scene.containerRef.current = document.querySelector('[data-hero-stage]');
mountHeroUI(scene);
mountAdmin(scene);
scene.componentDidMount();
