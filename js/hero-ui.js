// Wires the toolbar, settings panel, credit toast and sign drawer in index.html to the HeroScene state.
export function mountHeroUI(scene) {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const soundBtn = q('[data-action="sound"]');
  const settings = q('#scene-settings'), info = q('#scene-info');
  const drawer = q('#sign-drawer'), backdrop = q('#sign-drawer-backdrop');
  const hoverSwitch = q('[data-action="hover"]'), saved = q('[data-saved]');
  let infoTimer, savedTimer;

  const value = {
    brightness: () => scene.state.brightness, bloom: () => scene._bloom(), fog: () => scene._fog(),
    flicker: () => scene._flicker(), drift: () => scene.state.drift
  };
  const pct = (v) => Math.round(v * 100) + '%';
  const fmt = { brightness: pct, bloom: (v) => v.toFixed(2) + '×', fog: pct, flicker: pct, drift: (v) => v.toFixed(1) + '×' };
  const sounds = () => [scene._kaw, scene._rollSfx, scene._zapSfx, scene._coinSfx, scene._mRainSfx].filter(Boolean);

  function sync() {
    const s = scene.state;
    const soundAria = s.soundOn ? 'Mute sound' : 'Unmute sound';
    soundBtn.setAttribute('aria-pressed', String(!!s.soundOn));
    soundBtn.setAttribute('aria-label', soundAria);
    soundBtn.title = soundAria;
    q('[data-when="sound-on"]').style.display = s.soundOn ? '' : 'none';
    q('[data-when="sound-off"]').style.display = s.soundOn ? 'none' : '';

    settings.hidden = !s.settingsOpen;
    const gear = q('.toolbar [data-action="settings"]');
    gear.classList.toggle('is-active', !!s.settingsOpen);
    gear.setAttribute('aria-expanded', String(!!s.settingsOpen));
    info.hidden = !s.infoOpen;
    q('.toolbar [data-action="info"]').setAttribute('aria-expanded', String(!!s.infoOpen));

    qa('[data-size]').forEach((b) => {
      const on = parseFloat(b.dataset.size) === s.size;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    qa('input[data-key]').forEach((i) => {
      const k = i.dataset.key, v = value[k]();
      if (document.activeElement !== i) i.value = v;
      q(`[data-out="${k}"]`).textContent = fmt[k](v);
    });
    hoverSwitch.setAttribute('aria-checked', String(scene._hover()));
    saved.hidden = !s.savedFlash;

    const sign = s.activeSign && scene.signInfo[s.activeSign];
    drawer.hidden = backdrop.hidden = !sign;
    if (sign) {
      drawer.style.setProperty('--sign', sign.color);
      q('#sign-drawer-title').textContent = sign.title;
      q('#sign-drawer-text').textContent = sign.text;
    }
  }

  const on = (sel, fn, ev = 'click') => qa(sel).forEach((el) => el.addEventListener(ev, fn));

  on('[data-action="sound"]', () => {
    const next = !scene.state.soundOn;
    if (!next) sounds().forEach((a) => a.pause());
    scene.setState({ soundOn: next });
  });
  on('[data-action="settings"]', () => scene.setState({ settingsOpen: !scene.state.settingsOpen, infoOpen: false }));
  on('[data-action="info"]', () => {
    clearTimeout(infoTimer);
    const next = !scene.state.infoOpen;
    if (next) infoTimer = setTimeout(() => scene.setState({ infoOpen: false }), 8000);
    scene.setState({ infoOpen: next, settingsOpen: false });
  });
  qa('[data-size]').forEach((b) => b.addEventListener('click', () => scene.setState({ size: parseFloat(b.dataset.size) })));
  qa('input[data-key]').forEach((i) => i.addEventListener('input', () => scene.setState({ [i.dataset.key]: parseFloat(i.value) })));
  on('[data-action="hover"]', () => scene.setState({ hover: !scene._hover() }));
  on('[data-action="reset"]', () => scene.setState({ bloom: null, fog: null, flicker: null, drift: 1, hover: null, size: 0.75, brightness: 1 }));
  on('[data-action="save"]', () => {
    const { size, brightness, bloom, fog, flicker, drift, hover } = scene.state;
    localStorage.setItem('neonHeroScene.settings', JSON.stringify({ size, brightness, bloom, fog, flicker, drift, hover }));
    scene.setState({ savedFlash: true });
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => scene.setState({ savedFlash: false }), 1600);
  });
  on('[data-action="close-drawer"]', () => scene.setState({ activeSign: null }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (scene.state.activeSign) scene.setState({ activeSign: null });
    else if (scene.state.settingsOpen) scene.setState({ settingsOpen: false });
  });

  scene.onStateChange = sync;
  sync();
}
