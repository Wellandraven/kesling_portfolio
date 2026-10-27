// Wires the toolbar, settings panel, credit toast and sign drawer in index.html to the HeroScene state.
export function mountHeroUI(scene) {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const soundBtn = q('[data-action="sound"]');
  const settings = q('#scene-settings'), info = q('#scene-info');
  const drawer = q('#sign-drawer'), backdrop = q('#sign-drawer-backdrop');
  const hoverSwitch = q('[data-action="hover"]'), saved = q('[data-saved]');
  let infoTimer, savedTimer, shownSign, opener;

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
      // the sheet stops at the bottom of the top nav so the toolbar stays visible
      document.documentElement.style.setProperty('--nav-h', `${Math.max(0, q('.toolbar').getBoundingClientRect().bottom)}px`);
      drawer.style.setProperty('--sign', sign.color);
      q('#sign-drawer-title').textContent = sign.title;
      const text = q('#sign-drawer-text');
      text.textContent = sign.text;
      text.hidden = !sign.text;
      const subhead = q('#sign-drawer-subhead');
      subhead.textContent = sign.projectsHeading || '';
      subhead.hidden = !sign.projectsHeading;
    }
    // sync runs on every state change, so only rebuild the project list when the open sign changes
    if (s.activeSign !== shownSign) {
      shownSign = s.activeSign;
      renderProjects((sign && sign.projects) || []);
      // closed after opening from a label: hand focus back to that label
      if (!sign && opener) { opener.focus(); opener = null; }
    }
  }

  // case-study cards from content.json → signs.<key>.projects
  function renderProjects(projects) {
    const list = q('#sign-drawer-projects');
    list.hidden = !projects.length;
    list.replaceChildren(...projects.map((p) => {
      const li = document.createElement('li');
      li.className = 'drawer-project';
      if (p.thumb) {
        const img = document.createElement('img');
        img.className = 'drawer-project-thumb';
        img.src = p.thumb;
        img.alt = ''; // the title below names the project
        img.loading = 'lazy';
        li.append(img);
      }
      const title = document.createElement('h3');
      title.textContent = p.title;
      const blurb = document.createElement('p');
      blurb.textContent = p.blurb || '';
      const links = document.createElement('div');
      links.className = 'drawer-project-links';
      for (const l of p.links || []) {
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = l.label;
        links.append(a);
      }
      li.append(title, blurb, links);
      return li;
    }));
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
  on('[data-action="reset"]', () => scene.setState({ bloom: null, fog: null, flicker: null, drift: 3, hover: null, size: 0.75, brightness: 0.87 }));
  on('[data-action="save"]', () => {
    const { size, brightness, bloom, fog, flicker, drift, hover } = scene.state;
    localStorage.setItem('neonHeroScene.settings', JSON.stringify({ size, brightness, bloom, fog, flicker, drift, hover }));
    scene.setState({ savedFlash: true });
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => scene.setState({ savedFlash: false }), 1600);
  });
  on('[data-action="close-drawer"]', () => scene.setState({ activeSign: null }));
  // nav labels: text and color from the sign, and a keyboard/screen-reader way into each drawer
  qa('[data-open-sign]').forEach((b) => {
    const info = scene.signInfo[b.dataset.openSign];
    if (!info) return;
    b.textContent = info.title;
    b.style.setProperty('--sign', info.color);
    // hovering or focusing a label plays its sign's hover animation (read each frame by the scene)
    const hoverOn = () => { scene._labelHover = b.dataset.openSign; };
    const hoverOff = () => { if (scene._labelHover === b.dataset.openSign) scene._labelHover = null; };
    b.addEventListener('pointerenter', hoverOn);
    b.addEventListener('pointerleave', hoverOff);
    b.addEventListener('focus', hoverOn);
    b.addEventListener('blur', hoverOff);
    b.addEventListener('click', () => {
      opener = b;
      scene.setState({ activeSign: b.dataset.openSign });
      q('#sign-drawer .close-btn').focus();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (scene.state.activeSign) scene.setState({ activeSign: null });
    else if (scene.state.settingsOpen) scene.setState({ settingsOpen: false });
  });

  scene.onStateChange = sync;
  sync();
}
