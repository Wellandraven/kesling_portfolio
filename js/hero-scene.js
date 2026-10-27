// Neon sign hero scene. Ported verbatim from "Neon Hero Scene.dc.html" (only asset paths changed).
// Sign drawer text is overridden from content.json in main.js; colors live here.
import { SceneBase } from './scene-base.js';

export class HeroScene extends SceneBase {
  containerRef = { current: null };
  state = { size: 0.75, brightness: 0.87, soundOn: false, settingsOpen: false, bloom: null, fog: null, flicker: null, drift: 3, hover: null, savedFlash: false, activeSign: null };
  signInfo = {
    raven: { title: 'Well and Raven', color: '#5fb8e6', text: 'Write about what this sign means to you here.' },
    heart: { title: 'About Will', color: '#ff3355', text: 'Write about what this sign means to you here.' },
    d20: { title: 'The D20', color: '#b98cff', text: 'Write about what this sign means to you here.' },
    tools: { title: 'Wrench & Pencil', color: '#6dffb0', text: 'Write about what this sign means to you here.' },
    mmark: { title: 'The M Mark', color: '#f5375d', text: 'Write about what this sign means to you here.' },
    qblock: { title: 'The Question Block', color: '#ffd21e', text: 'Write about what this sign means to you here.' }
  };
  // settings panel values fall back to the Tweaks defaults until the user moves them
  _bloom() { return this.state.bloom ?? this.props.bloomStrength ?? 1.4; }
  _fog() { return this.state.fog ?? this.props.fogDensity ?? 0.6; }
  _flicker() { return this.state.flicker ?? this.props.flickerAmount ?? 0.6; }
  _hover() { return this.state.hover ?? this.props.mouseReact ?? true; }

  componentDidMount() {
    this._alive = true;
    try {
      const saved = JSON.parse(localStorage.getItem('neonHeroScene.settings'));
      if (saved) this.setState(saved);
    } catch (e) {}
    this._boot();
  }

  componentWillUnmount() {
    this._alive = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    const el = this.containerRef.current;
    if (el) {
      el.removeEventListener('pointermove', this._onMove);
      el.removeEventListener('pointerleave', this._onLeave);
      el.removeEventListener('pointerdown', this._onDown);
    }
    if (this._kaw) { this._kaw.pause(); this._kaw.src = ''; }
    if (this._rollSfx) { this._rollSfx.pause(); this._rollSfx.src = ''; }
    if (this._zapSfx) { this._zapSfx.pause(); this._zapSfx.src = ''; }
    if (this._coinSfx) { this._coinSfx.pause(); this._coinSfx.src = ''; }
    if (this._mRainSfx) { this._mRainSfx.pause(); this._mRainSfx.src = ''; }
    clearTimeout(this._infoTimer);
    if (this._renderer) {
      this._renderer.dispose();
      if (this._renderer.domElement && this._renderer.domElement.parentNode) {
        this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
      }
    }
  }

  async _boot() {
    const THREE = await import('three');
    const circlePointsRaw = (cx, cy, rx, ry, segments) => {
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      return pts;
    };
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js');
    // Raven mark: sample every SVG sub-path into point lists, normalized to the ~±1 local space the other signs use
    // Load a neon SVG: strokes become point lists normalized to the ~±1 local space the hand-built signs use.
    // poly=true keeps straight segments as separate 2-point runs (crisp corners) instead of smoothed curves.
    const loadMark = (url, cx, cy, span, poly) => new Promise((resolve) => {
      new SVGLoader().load(url, (data) => {
        const out = [], seen = new Set();
        const map = (v) => [(v.x - cx) / span, -(v.y - cy) / span];
        for (const p of data.paths) {
          const d = (p.userData && p.userData.node ? p.userData.node.getAttribute('d') : '') || (p.userData && p.userData.node ? p.userData.node.outerHTML : '');
          if (seen.has(d)) continue; // the files duplicate every stroke for a white core layer
          seen.add(d);
          for (const sp of p.subPaths) {
            if (poly === 'spaced') {
              const n = Math.max(8, Math.ceil(sp.getLength() / span / 0.015));
              const pts = sp.getSpacedPoints(n).map(map);
              const f = pts[0], l = pts[pts.length - 1];
              const closed = Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01;
              if (closed) pts.pop();
              out.push({ pts, closed });
              continue;
            }
            if (poly === true) {
              for (const c of sp.curves) if (c.v1 && c.v2) out.push({ pts: [map(c.v1), map(c.v2)], closed: false, straight: true });
              continue;
            }
            const pts = sp.getPoints(6).map(map);
            if (pts.length < 2) continue;
            const f = pts[0], l = pts[pts.length - 1];
            const closed = Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01;
            if (closed) pts.pop();
            out.push({ pts, closed, d: d.replace(/(\d+\.\d{2})\d+/g, '$1') });
          }
        }
        resolve(out);
      }, undefined, () => resolve([]));
    });
    const [ravenPaths, ravenOpen, toolPaths, mPaths] = await Promise.all([
      loadMark('assets/raven-mark.svg', 400, 421, 470),
      loadMark('assets/raven-mark-open.svg', 400, 421, 470),
      loadMark('assets/wrench-pencil.svg', 160, 160, 120, 'spaced'),
      loadMark('assets/m-mark.svg', 141, 122, 100, 'spaced')
    ]);
    // Throat feathers: the stroke that differs between the two files morphs to its beak-open position as the jaw drops
    const openSet = new Set(ravenOpen.map(p => p.d)), closedSet = new Set(ravenPaths.map(p => p.d));
    const openOnly = ravenOpen.filter(p => !closedSet.has(p.d));
    for (const p of ravenPaths) {
      if (openSet.has(p.d)) continue;
      const match = openOnly.find(o => o.pts.length === p.pts.length && o.closed === p.closed);
      if (match) { p.morphTo = match.pts; openOnly.splice(openOnly.indexOf(match), 1); }
    }
    // Beak = the closed wedge stroke at the head's right (SVG x 435-640, y 377-431). Split it at the tip into
    // upper and lower mandibles so the lower one can hinge open around the base of the beak.
    const beakSrc = ravenPaths.find(p => {
      const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      return p.closed && minX > 0.04 && minX < 0.12 && maxX > 0.45 && maxX < 0.56 && minY > -0.06 && maxY < 0.14;
    });
    // The whole wedge is the lower mandible: it rotates rigidly about its leftmost vertex (clock hand, 3 → 4 o'clock)
    let beakHinge = [0, 0], beakTipOpen = [0, 0];
    const beakAngle = -0.52;
    if (beakSrc) {
      beakSrc.mandible = 'lower';
      beakHinge = beakSrc.pts.reduce((a, q) => (q[0] < a[0] ? q : a), beakSrc.pts[0]);
      const tip = beakSrc.pts.reduce((a, q) => (q[0] > a[0] ? q : a), beakSrc.pts[0]);
      const dx = tip[0] - beakHinge[0], dy = tip[1] - beakHinge[1];
      beakTipOpen = [beakHinge[0] + dx * Math.cos(beakAngle) - dy * Math.sin(beakAngle), beakHinge[1] + dx * Math.sin(beakAngle) + dy * Math.cos(beakAngle)];
    }
    if (!this._alive) return;

    const container = this.containerRef.current;
    // Layout comes from the DOM: each sign has a .sign-cell in a CSS flex-wrap container (index.html / styles.css).
    // The canvas covers the stage behind them; measure() reads where the cells landed and the scene follows.
    // 3.8 world units per cell height, so a 2.8-unit sign fills most of its cell at any cell size.
    const CELL_WORLD_H = 3.8;
    const cellEls = {};
    for (const el of container.querySelectorAll('.sign-cell[data-sign]')) cellEls[el.dataset.sign] = el;
    const measure = () => {
      const r = container.getBoundingClientRect();
      const cells = {};
      for (const [k, el] of Object.entries(cellEls)) {
        const c = el.getBoundingClientRect();
        cells[k] = { cx: c.left + c.width / 2 - r.left, cy: c.top + c.height / 2 - r.top, w: c.width, h: c.height };
      }
      const cellH = Object.values(cells).reduce((m, c) => Math.max(m, c.h), 0);
      return { w: Math.round(r.width), h: Math.round(r.height), upp: cellH ? CELL_WORLD_H / cellH : 0, cells };
    };
    // the host may not have laid out yet when _boot runs: wait a few frames for real sizes
    let m = measure();
    for (let i = 0; i < 10 && !(m.w && m.h && m.upp); i++) { await new Promise(r => requestAnimationFrame(r)); m = measure(); }
    if (!this._alive) return;
    if (!(m.w && m.h && m.upp)) m = { ...m, w: m.w || 1200, h: m.h || 600, upp: m.upp || CELL_WORLD_H / 300 };
    const w = m.w, h = m.h;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050308);

    const worldHeight = h * m.upp;
    const worldWidth = w * m.upp;
    const camera = new THREE.OrthographicCamera(-worldWidth / 2, worldWidth / 2, worldHeight / 2, -worldHeight / 2, 0.1, 20);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    // behind the sign cells and out of flow, so the cells alone set the stage's size
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    renderer.domElement.style.display = 'block';

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomStrength = this.props.bloomStrength ?? 1.4;
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.55, 0.15);
    composer.addPass(bloomPass);

    this._renderer = renderer;
    this._composer = composer;
    this._camera = camera;
    this._worldWidth = worldWidth;
    this._worldHeight = worldHeight;
    this._bloomPass = bloomPass;

    // --- shape helpers -------------------------------------------------
    const circlePoints = (cx, cy, r, segments) => {
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return pts;
    };

    const tubeRadius = 0.055;
    const allMeshes = [];
    this._appliedSize = 1;

    const buildPart = (points, closed, color, radiusMul, dense) => {
      const toCurve = (pts) => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], 0)), closed, dense ? 'centripetal' : 'catmullrom', 0.15);
      let curve = toCurve(points);
      const segs = dense ? Math.min(400, Math.max(8, points.length * 2)) : Math.max(24, points.length * 6);
      const makeGeo = (mul) => new THREE.TubeGeometry(curve, segs, tubeRadius * (radiusMul || 1) * mul, 10, closed);
      const mat = new THREE.MeshBasicMaterial({ color });
      mat.toneMapped = false;
      mat.userData.baseColor = new THREE.Color(color);
      const mesh = new THREE.Mesh(makeGeo(1), mat);
      mesh.userData.mat = mat;
      mesh.userData.rebuild = (mul) => { mesh.geometry.dispose(); mesh.geometry = makeGeo(mul); };
      mesh.userData.setPoints = (pts) => { curve = toCurve(pts); mesh.userData.rebuild(this._appliedSize); };
      allMeshes.push(mesh);
      return mesh;
    };

    const SHAPES = {
      raven: (color) => {
        const g = new THREE.Group();
        g.userData.mandibles = []; g.userData.morphs = [];
        for (const sp of ravenPaths) {
          const m = buildPart(sp.pts, sp.closed, color, 0.2, true);
          if (sp.mandible) g.userData.mandibles.push({ mesh: m, pts: sp.pts, angle: beakAngle });
          if (sp.morphTo) g.userData.morphs.push({ mesh: m, from: sp.pts, to: sp.morphTo });
          g.add(m);
        }
        return g;
      },
      tools: (color) => {
        const g = new THREE.Group();
        g.userData.tools = true;
        for (const sp of toolPaths) g.add(buildPart(sp.pts, sp.closed, color, 0.28, true));
        return g;
      },
      // M monogram: the two slanted stems + underscore, each traced as one closed tube
      mmark: (color) => {
        const g = new THREE.Group();
        g.userData.mmark = true;
        for (const sp of mPaths) g.add(buildPart(sp.pts, sp.closed, color, 0.5, true));
        return g;
      },
      // 3D neon D20: clean icosahedron, tube edges + welded joints, faint glass faces, tube "20" on the front face.
      // Idle: gentle decaying tumble. Hover/tap: rolls, then homes onto the 20 and rests.
      d20: (color) => {
        const g = new THREE.Group();
        const R = 1, tr = tubeRadius * 0.55;
        const ico = new THREE.IcosahedronGeometry(R, 0);
        const pos = ico.attributes.position;
        const fv = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(pos, i));
        const fc = fv[0].clone().add(fv[1]).add(fv[2]).divideScalar(3);
        ico.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(fc.clone().normalize(), new THREE.Vector3(0, 0, 1)));
        const top = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(pos, i)).sort((a, b) => b.y - a.y)[0];
        ico.rotateZ(Math.PI / 2 - Math.atan2(top.y, top.x));

        const faceMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, depthWrite: false });
        faceMat.toneMapped = false;
        faceMat.color.multiplyScalar(0.5);
        g.add(new THREE.Mesh(ico, faceMat));

        const mat = new THREE.MeshBasicMaterial({ color });
        mat.toneMapped = false;
        mat.userData.baseColor = new THREE.Color(color).multiplyScalar(0.6); // dense object: keep it under the bloom
        const verts = [], vIndex = [];
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, i);
          let idx = verts.findIndex(u => u.distanceToSquared(v) < 1e-6);
          if (idx < 0) { idx = verts.length; verts.push(v); }
          vIndex.push(idx);
        }
        const edges = new Set();
        for (let f = 0; f < pos.count; f += 3) for (let e = 0; e < 3; e++) {
          const a = vIndex[f + e], b = vIndex[f + (e + 1) % 3];
          edges.add(a < b ? a + '_' + b : b + '_' + a);
        }
        const up = new THREE.Vector3(0, 1, 0);
        for (const key of edges) {
          const [a, b] = key.split('_').map(Number);
          const A = verts[a], B = verts[b];
          const m = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr, A.distanceTo(B), 12, 1, true), mat);
          m.position.copy(A).add(B).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize());
          m.userData.mat = mat;
          m.userData.rebuild = (mul) => m.scale.set(mul, 1, mul);
          allMeshes.push(m); g.add(m);
        }
        const jointGeo = new THREE.SphereGeometry(tr, 14, 12);
        for (const v of verts) {
          const s = new THREE.Mesh(jointGeo, mat);
          s.position.copy(v);
          s.userData.rebuild = (mul) => s.scale.setScalar(mul);
          allMeshes.push(s); g.add(s);
        }
        const inr = R * 0.7947, ds = 0.36, shift = -0.05;
        const two = [[-0.42, 0.25], [-0.32, 0.38], [-0.16, 0.42], [0.0, 0.38], [0.08, 0.26], [0.02, 0.1], [-0.18, -0.06], [-0.42, -0.3], [0.08, -0.3]];
        const zero = circlePointsRaw(0.32, 0.06, 0.2, 0.36, 20);
        for (const n of [{ pts: two, closed: false }, { pts: zero, closed: true }]) {
          const curve = new THREE.CatmullRomCurve3(n.pts.map(p => new THREE.Vector3((p[0] + shift) * ds, p[1] * ds, inr + 0.012)), n.closed, 'catmullrom', 0.2);
          const make = (mul) => new THREE.TubeGeometry(curve, 48, tr * 0.75 * mul, 10, n.closed);
          const m = new THREE.Mesh(make(1), mat);
          m.userData.rebuild = (mul) => { m.geometry.dispose(); m.geometry = make(mul); };
          allMeshes.push(m); g.add(m);
        }

        // motion state machine, driven from the tick via g.userData.die.update
        const restQuat = g.quaternion.clone();
        const spinAxis = new THREE.Vector3(), rollAxis = new THREE.Vector3(), rollAxis2 = new THREE.Vector3();
        const die = { mode: 'idle', rollStart: 0, hovering: false };
        die.roll = (now) => {
          if (die.mode === 'rolling' || die.mode === 'settling') return;
          die.mode = 'rolling'; die.rollStart = now;
          if (die.onRoll) die.onRoll();
          rollAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          rollAxis2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        };
        die.update = (t, dt) => {
          if (die.mode === 'idle') {
            spinAxis.set(Math.sin(t * 0.21) * 0.6 + 0.3, 1, Math.cos(t * 0.17) * 0.5).normalize();
            g.rotateOnWorldAxis(spinAxis, dt * (0.12 + 0.55 * Math.exp(-t / 5) + 0.05 * Math.sin(t * 0.9)));
          } else if (die.mode === 'rolling') {
            const u = Math.min(1, (t - die.rollStart) / 1.8);
            const speed = 9 * Math.pow(1 - u, 2.2);
            g.rotateOnWorldAxis(rollAxis, dt * speed);
            g.rotateOnWorldAxis(rollAxis2, dt * speed * 0.4 * Math.sin(u * Math.PI));
            const home = u < 0.45 ? 0 : (u - 0.45) / 0.55;
            const pull = home * home * (3 - 2 * home);
            g.quaternion.slerp(restQuat, 1 - Math.pow(1 - pull * 0.9, dt * 6));
            if (u >= 1) die.mode = 'settling';
          } else if (die.mode === 'settling') {
            g.quaternion.slerp(restQuat, 1 - Math.pow(0.02, dt));
            if (g.quaternion.angleTo(restQuat) < 0.002) { g.quaternion.copy(restQuat); die.mode = 'rest'; }
          }
        };
        g.userData.die = die;
        return g;
      },
      controller: (color) => {
        const g = new THREE.Group();
        g.add(buildPart([
          [-1.0, 0.05], [-0.82, 0.32], [-0.5, 0.38], [-0.32, 0.2],
          [0.32, 0.2], [0.5, 0.38], [0.82, 0.32], [1.0, 0.05],
          [0.92, -0.32], [0.68, -0.42], [0.48, -0.28], [-0.48, -0.28],
          [-0.68, -0.42], [-0.92, -0.32]
        ], true, color));
        g.add(buildPart(circlePoints(0.55, 0.02, 0.1, 14), true, color, 0.8));
        g.add(buildPart(circlePoints(0.8, -0.1, 0.1, 14), true, color, 0.8));
        g.add(buildPart([[-0.8, -0.1], [-0.48, -0.1]], false, color, 0.8));
        g.add(buildPart([[-0.64, 0.06], [-0.64, -0.26]], false, color, 0.8));
        return g;
      },
      // 3D neon question block: tube edges + corner joints, four rivets per face, blocky "?" tubes on all six
      // faces, faint glass faces. Idle: slow tilted turntable spin. Hover/tap: the classic bump — it hops and flashes.
      qblock: (color) => {
        const g = new THREE.Group();
        const S = 0.8, tr = tubeRadius * 0.6;
        const faceMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false });
        faceMat.toneMapped = false; faceMat.color.multiplyScalar(0.5);
        g.add(new THREE.Mesh(new THREE.BoxGeometry(S * 2, S * 2, S * 2), faceMat));
        const mat = new THREE.MeshBasicMaterial({ color }); mat.toneMapped = false;
        mat.userData.baseColor = new THREE.Color(color).multiplyScalar(0.65); // dense object: keep it under the bloom
        const rivetMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 }); rivetMat.toneMapped = false;
        rivetMat.userData.baseColor = new THREE.Color(0xfff3c4).multiplyScalar(0.55);
        const up = new THREE.Vector3(0, 1, 0), corners = [];
        for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? S : -S, i & 2 ? S : -S, i & 4 ? S : -S));
        for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
          if ((a ^ b) & ((a ^ b) - 1)) continue; // an edge joins corners that differ on exactly one axis
          const A = corners[a], B = corners[b];
          const m = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr, A.distanceTo(B), 12, 1, true), mat);
          m.position.copy(A).add(B).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize());
          m.userData.mat = mat; m.userData.rebuild = (mul) => m.scale.set(mul, 1, mul);
          allMeshes.push(m); g.add(m);
        }
        const jointGeo = new THREE.SphereGeometry(tr, 14, 12), rivetGeo = new THREE.SphereGeometry(tr * 1.5, 14, 12);
        for (const v of corners) {
          const s = new THREE.Mesh(jointGeo, mat); s.position.copy(v);
          s.userData.rebuild = (mul) => s.scale.setScalar(mul);
          allMeshes.push(s); g.add(s);
        }
        // blocky "?": a hook stroke plus a dot on a 5x7 cell grid, straight runs kept crisp by densifying the polyline
        const cell = 0.17, P = (c, r) => [(c - 2) * cell, (3 - r) * cell];
        const densify = (pts, step) => {
          const out = [];
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
            for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
          }
          out.push(pts[pts.length - 1]);
          return out;
        };
        const hook = densify([P(0, 1.7), P(0, 0.6), P(0.6, 0), P(3.4, 0), P(4, 0.6), P(4, 2.4), P(3.4, 3), P(2.6, 3), P(2, 3.6), P(2, 4.7)], 0.03);
        const dot = densify([P(1.6, 6), P(2.4, 6)], 0.03);
        const faces = [[0, 0, 0], [0, Math.PI, 0], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0]];
        const faceGroups = [];
        for (const rot of faces) {
          const f = new THREE.Group();
          f.rotation.set(rot[0], rot[1], rot[2]);
          f.position.set(0, 0, S + 0.01).applyEuler(f.rotation);
          const fRivet = rivetMat.clone(); fRivet.userData.baseColor = rivetMat.userData.baseColor; // per face so it can fade independently
          if (rot[0] === 0) { // the four side faces carry the "?"; top and bottom are rivets only
            f.add(buildPart(hook, false, color, 0.55, true));
            f.add(buildPart(dot, false, color, 0.55, true));
          }
          for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const rv = new THREE.Mesh(rivetGeo, fRivet); rv.position.set(u * 0.62, v * 0.62, 0);
            rv.userData.mat = fRivet; rv.userData.rebuild = (mul) => rv.scale.setScalar(mul);
            allMeshes.push(rv); f.add(rv);
          }
          for (const c of f.children) c.material.transparent = true;
          faceGroups.push({ f, n: new THREE.Vector3(0, 0, 1).applyEuler(f.rotation) });
          g.add(f);
        }
        // motion: turntable spin with a slight tilt; hit() hops it up and flashes it, driven from the tick.
        // Faces turning away from the camera fade out so the back "?"s don't show through the glass.
        const block = { hop: 0, flash: 0, hitStart: -10, hovering: false };
        const _n = new THREE.Vector3();
        block.hit = (now) => { if (now - block.hitStart < 0.45) return; block.hitStart = now; if (block.onHit) block.onHit(); };
        block.update = (t) => {
          g.rotation.set(0.42 + 0.06 * Math.sin(t * 0.7), t * 0.45, 0);
          for (const fg of faceGroups) {
            const vis = Math.max(0, Math.min(1, (_n.copy(fg.n).applyEuler(g.rotation).z - 0.05) / 0.35));
            fg.f.visible = vis > 0.01;
            for (const c of fg.f.children) c.material.opacity = vis;
          }
          const u = (t - block.hitStart) / 0.42;
          block.hop = u < 1 ? Math.sin(u * Math.PI) * 0.45 : 0;
          block.flash = u < 1 ? (1 - u) * 0.6 : 0;
        };
        // coin: neon gold disc (front/back rims, inner ring and a pill mark per face, glass body). It lives in the
        // scene rather than in g so it can fly straight up in world space; a clipping plane on the block's top face
        // hides whatever is still inside, so it emerges from the top and sinks back in.
        const coin = new THREE.Group(); coin.visible = false;
        const CR = 0.46, CH = 0.06, COIN_T = 1.0, COIN_A = 0.5, coinColor = 0xffc233;
        const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const stadium = (hw, hh) => {
          const sh = hh - hw, pts = [];
          const arc = (cy, a0) => { for (let i = 0; i < 10; i++) { const a = a0 + (i / 10) * Math.PI; pts.push([hw * Math.cos(a), cy + hw * Math.sin(a)]); } };
          const side = (x, y0, y1) => { for (let i = 0; i < 6; i++) pts.push([x, y0 + (y1 - y0) * i / 6]); };
          side(hw, -sh, sh); arc(sh, 0); side(-hw, sh, -sh); arc(-sh, Math.PI);
          return pts;
        };
        const coinPart = (pts, mul) => {
          const m = buildPart(pts, true, coinColor, mul, true);
          m.material.clippingPlanes = [clip]; m.userData.mat.userData.baseColor.multiplyScalar(0.9);
          return m;
        };
        for (const sgn of [1, -1]) {
          const f = new THREE.Group(); f.position.z = sgn * CH;
          f.add(coinPart(circlePoints(0, 0, CR, 40), 0.5));
          f.add(coinPart(circlePoints(0, 0, CR * 0.76, 32), 0.38));
          f.add(coinPart(stadium(0.11, 0.24), 0.38));
          coin.add(f);
        }
        const coinGlass = new THREE.MeshBasicMaterial({ color: coinColor, transparent: true, opacity: 0.14, depthWrite: false, clippingPlanes: [clip] });
        coinGlass.toneMapped = false; coinGlass.color.multiplyScalar(0.5);
        const glassGeo = new THREE.CylinderGeometry(CR, CR, CH * 2, 48); glassGeo.rotateX(Math.PI / 2);
        coin.add(new THREE.Mesh(glassGeo, coinGlass));
        block.coin = coin;
        // flight: a world-space parabola out of the top face and back in (the hop moves the clip plane, not the coin);
        // the apex is tuned to stay inside the frame. onVanish fires once it has sunk back in.
        const _c = new THREE.Vector3();
        block.placeCoin = (t) => {
          const tau = t - block.hitStart, active = tau >= 0 && tau < COIN_T;
          if (!active) { if (coin.visible) { coin.visible = false; if (block.onVanish) block.onVanish(_c); } return; }
          coin.visible = true;
          const sc = g.scale.x, k = (tau - COIN_A) / COIN_A;
          _n.set(0, 1, 0).applyEuler(g.rotation);
          _c.copy(_n).multiplyScalar(S * sc).add(g.position);
          clip.setFromNormalAndCoplanarPoint(_n, _c);
          coin.position.set(_c.x, g.position.y - block.hop + (0.15 + 2.3 * (1 - k * k)) * sc, _c.z);
          coin.scale.setScalar(sc);
          coin.rotation.y = tau * 11;
        };
        g.userData.block = block;
        return g;
      },
      joystick: (color) => {
        const g = new THREE.Group();
        const base = circlePoints(0, -0.62, 0.62, 20).map(p => [p[0], p[1] * 0.42 + (-0.62 * 0.58)]);
        g.add(buildPart(base, true, color));
        g.add(buildPart([[0, -0.45], [0, 0.35]], false, color, 0.9));
        g.add(buildPart(circlePoints(0, 0.55, 0.28, 16), true, color));
        return g;
      },
      heart: (color) => {
        const g = new THREE.Group();
        g.add(buildPart([
          [0, -0.85], [-0.55, -0.25], [-0.95, 0.15], [-0.7, 0.65],
          [-0.3, 0.55], [0, 0.2], [0.3, 0.55], [0.7, 0.65],
          [0.95, 0.15], [0.55, -0.25]
        ], true, color));
        return g;
      },
      gear: (color) => {
        const g = new THREE.Group();
        const teeth = [];
        const n = 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const r = i % 2 === 0 ? 1.0 : 0.74;
          teeth.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        g.add(buildPart(teeth, true, color));
        g.add(buildPart(circlePoints(0, 0, 0.34, 16), true, color, 0.85));
        return g;
      },
    };

    // Equal footprint: each sign is scaled so its longest side spans SIGN_SIZE world units × its `size` (1 = equal).
    // That is the front of the scene — the biggest a sign gets. `depth` staggers each one back from there
    // (0 = front, 1 = furthest back); hover or tap brings it forward to the front.
    // `gauge` is the previous hand scale, kept so every sign's tube thickness stays where it was tuned.
    const SIGN_SIZE = 2.8;
    const defs = [
      { shape: 'raven', color: 0x5fb8e6, x: -5.8, y: 2.2, z: 0.3, size: 1, gauge: 1.7, depth: 0.3 },
      { shape: 'qblock', color: 0xffd21e, x: 4.6, y: -2.4, z: -0.3, size: 1, gauge: 1.0, depth: 0.75 },
      { shape: 'd20', color: 0xb98cff, x: 2.0, y: 2.4, z: 0.4, size: 1, gauge: 1.1, depth: 0.5 },
      { shape: 'tools', color: 0x6dffb0, x: -4.4, y: -2.2, z: 0.2, size: 1, gauge: 1.35, depth: 0.6 },
      { shape: 'mmark', color: 0xf5375d, x: 0.2, y: -2.0, z: 0.1, size: 1, gauge: 1.2, depth: 0.2 },
      { shape: 'heart', color: 0xff3355, x: -2.0, y: 2.6, z: -0.2, size: 1, gauge: 0.95, depth: 0.85 }
    ];

    // each sign's home is the center of its .sign-cell, with a small random jitter inside the cell —
    // rolled once per page load, so refreshing reshuffles where each sign lands but resizing doesn't.
    const homeOf = (d, mm) => {
      const c = mm.cells[d.shape];
      if (!c) return { x: d.x, y: d.y };
      return {
        x: (c.cx - mm.w / 2 + d.jx * c.w) * mm.upp,
        y: (mm.h / 2 - c.cy + d.jy * c.h) * mm.upp
      };
    };
    for (const d of defs) {
      d.jx = (Math.random() - 0.5) * 0.1; d.jy = (Math.random() - 0.5) * 0.1;
      Object.assign(d, homeOf(d, m));
    }
    this._orbitR = CELL_WORLD_H * 0.05; // each sign orbits its home spot by a small radius
    const signs = defs.map(d => {
      const group = SHAPES[d.shape](d.color);
      if (group.userData.block) group.rotation.set(0.42, 0.35, 0); // measure the block mid-turn; update() re-poses it every frame
      const box = new THREE.Box3().setFromObject(group);
      const ext = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
      d.scale = ext > 0 && isFinite(ext) ? SIGN_SIZE * d.size / ext : d.gauge;
      const k = d.gauge / d.scale;
      const keepGauge = (o) => { const r = o.userData && o.userData.rebuild; if (r) { o.userData.rebuild = (mul) => r(mul * k); r(k); } };
      group.traverse(keepGauge);
      if (group.userData.block) group.userData.block.coin.traverse(keepGauge);
      group.position.set(d.x, d.y, d.z);
      group.scale.setScalar(d.scale);
      scene.add(group);
      const mats = [];
      group.traverse(o => { if (o.userData && o.userData.mat) mats.push(o.userData.mat); });
      return {
        group, mats, shape: d.shape, signColor: new THREE.Color(d.color),
        x: d.x, y: d.y, baseScale: d.scale, frontZ: d.z, restDepth: d.depth, forward: 0, forwardUntil: 0,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: 0.12 + Math.random() * 0.12,
        flickerSeed: Math.random() * 1000,
        pulseSpeed: 0.5 + Math.random() * 0.5,
        pulsePhase: Math.random() * Math.PI * 2,
        nextFlickerAt: 1 + Math.random() * 4,
        flickerUntil: 0,
        boost: 0
      };
    });
    this._signs = signs;
    // hit boxes are stored relative to the sign's home (s.x, s.y) so they follow it when the layout reflows
    const localBox = (s, pad) => {
      const b = new THREE.Box3().setFromObject(s.group).expandByScalar(pad);
      return b.translate(new THREE.Vector3(-s.x, -s.y, 0));
    };
    const inLocalBox = (s, b, p) => p && p.x - s.x > b.min.x && p.x - s.x < b.max.x && p.y - s.y > b.min.y && p.y - s.y < b.max.y;
    // hit areas for the come-forward reaction, measured at the front (full) size so a receded sign is easy to reach
    for (const s of signs) {
      const b = localBox(s, 0.25);
      s.hit = (p) => inLocalBox(s, b, p);
    }

    // --- atmospheric fog ------------------------------------------------
    // A backdrop plane behind everything: two layers of drifting value noise, lit per pixel by every sign — each
    // one's live color and intensity falls off with distance, so the haze picks up the tubes' hues and flickers
    // with them. Drawn before the bloom, so the lit fog also feeds the glow.
    const NS = signs.length;
    const fogLights = new Float32Array(NS * 4), fogColors = new Float32Array(NS * 3);
    const fogMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAspect: { value: w / h }, uDensity: { value: this.props.fogDensity ?? 0.6 },
        uLights: { value: fogLights }, uColors: { value: fogColors }, uHalf: { value: new THREE.Vector2(worldWidth / 2, worldHeight / 2) }
      },
      defines: { NS },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform float uTime, uAspect, uDensity; uniform vec4 uLights[NS]; uniform vec3 uColors[NS]; uniform vec2 uHalf; varying vec2 vUv;',
        'float hash(vec2 p){ return fract(sin(dot(floor(p + 0.5), vec2(12.9898, 78.233))) * 43758.5453); }',
        'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
        'float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.02 + vec2(31.7, 17.3); a *= 0.5; } return v; }',
        'void main(){',
        '  vec2 wp = (vUv - 0.5) * 2.0 * uHalf;', // world position on the backdrop
        '  vec2 q = vec2(vUv.x * uAspect, vUv.y);',
        '  float n1 = fbm(q * 1.8 + vec2(uTime * 0.035, uTime * 0.012));',
        '  float n2 = fbm(q * 3.6 - vec2(uTime * 0.02, -uTime * 0.03) + 5.0);',
        '  float fog = smoothstep(0.2, 0.85, n1 * 0.65 + n2 * 0.35) * (0.5 + 0.5 * smoothstep(0.9, -0.6, wp.y / uHalf.y));', // thicker toward the floor
        '  vec3 light = vec3(0.0);',
        '  for (int i = 0; i < NS; i++) { vec4 L = uLights[i]; float d = length(wp - L.xy) / (L.z * 1.6 + 1.2); light += uColors[i] * L.w / (1.0 + d * d * 3.0); }',
        '  vec3 col = (vec3(0.05, 0.045, 0.075) * 0.3 + light * 0.3) * fog * uDensity;', // kept under the bloom threshold so it stays a haze
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      depthWrite: false
    });
    fogMat.toneMapped = false;
    const fogPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fogMat);
    fogPlane.position.z = -3; fogPlane.scale.set(worldWidth, worldHeight, 1); fogPlane.renderOrder = -1; fogPlane.frustumCulled = false;
    scene.add(fogPlane);
    this._fogPlane = fogPlane;

    const clock = new THREE.Clock();

    // --- raven beak interaction -------------------------------------------
    const raven = signs.find(s => s.group.userData.mandibles);
    const ravenBox = localBox(raven, 0.25);
    const inRaven = (p) => inLocalBox(raven, ravenBox, p);
    let beakOpen = 0, tapOpenUntil = 0, wasOpen = false;
    // caw: plays each time the beak starts to open (hover-enter or tap); browsers only allow this after a user gesture
    const kaw = new Audio('assets/raven-kaw.wav');
    kaw.preload = 'auto'; kaw.volume = 0.7;
    this._kaw = kaw;
    const playKaw = () => { if (!this.state.soundOn) return; try { kaw.currentTime = 0; const p = kaw.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };

    // --- pointer tracking ------------------------------------------------
    this._mouseWorld = null;
    const toWorld = (e) => {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      return { x: nx * (this._worldWidth / 2), y: ny * (this._worldHeight / 2) };
    };
    this._onMove = (e) => { this._mouseWorld = e.target === renderer.domElement ? toWorld(e) : null; };
    this._onLeave = () => { this._mouseWorld = null; };
    const dieSign = signs.find(s => s.group.userData.die);
    const inDie = (p) => p && Math.hypot(p.x - dieSign.x, p.y - dieSign.y) < dieSign.baseScale * 1.15;
    const rollSfx = new Audio('assets/roll-1d20.mp3');
    rollSfx.preload = 'auto'; rollSfx.volume = 0.8;
    this._rollSfx = rollSfx;
    dieSign.group.userData.die.onRoll = () => { if (!this.state.soundOn) return; try { rollSfx.currentTime = 0; const p = rollSfx.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
    // zap: plays each time the wrench & pencil sign starts arcing (hover-enter or tap)
    const zapSfx = new Audio('assets/electric.mp3');
    zapSfx.preload = 'auto'; zapSfx.volume = 0.7;
    this._zapSfx = zapSfx;
    const playZap = () => { if (!this.state.soundOn) return; try { zapSfx.currentTime = 0; const p = zapSfx.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
    const coinSfx = new Audio('assets/mario-coin.mp3');
    coinSfx.preload = 'auto'; coinSfx.volume = 0.7;
    this._coinSfx = coinSfx;
    const playCoin = () => { if (!this.state.soundOn) return; try { coinSfx.currentTime = 0; const p = coinSfx.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
    const mRainSfx = new Audio('assets/m-rain.wav');
    mRainSfx.preload = 'auto'; mRainSfx.volume = 0.6;
    this._mRainSfx = mRainSfx;
    const playMRain = () => { if (!this.state.soundOn) return; try { mRainSfx.currentTime = 0; const p = mRainSfx.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
    // --- wrench & pencil: electric arcs + sparks while hovered or briefly after a tap ---
    const toolsSign = signs.find(s => s.group.userData.tools);
    const toolsBox = localBox(toolsSign, 0.3);
    const inTools = (p) => inLocalBox(toolsSign, toolsBox, p);
    const outline = toolPaths.flatMap(sp => sp.pts);
    const _lv = new THREE.Vector3();
    const outlineWorld = () => { const p = outline[(Math.random() * outline.length) | 0]; const w = toolsSign.group.localToWorld(_lv.set(p[0], p[1], 0)).clone(); w.z += 0.12; return w; };
    let zapUntil = 0, zapLevel = 0, wasZap = false, nextRegen = 0, sparkAcc = 0;

    // sparks: soft additive points, recycled from a fixed pool
    const MAXP = 240;
    const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pSize = new Float32Array(MAXP), pSize0 = new Float32Array(MAXP);
    const pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pMax = new Float32Array(MAXP), pKind = new Float32Array(MAXP);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: renderer.getPixelRatio() } },
      vertexShader: 'attribute vec3 aColor; attribute float aSize; uniform float uPR; varying vec3 vColor; void main(){ vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; }',
      fragmentShader: 'varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d); gl_FragColor = vec4(vColor * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const sparks = new THREE.Points(pGeo, pMat); sparks.frustumCulled = false; scene.add(sparks);
    let pHead = 0;
    const sparkAt = (p, speed, kind, from) => {
      const c = from || toolsSign.group.position;
      let dx = p.x - c.x, dy = p.y - c.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const sp = speed * (0.5 + Math.random());
      const i = pHead; pHead = (pHead + 1) % MAXP;
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z + 0.05;
      pVel[i * 3] = dx * sp + (Math.random() - 0.5) * speed; pVel[i * 3 + 1] = dy * sp + (Math.random() - 0.5) * speed + 0.5; pVel[i * 3 + 2] = 0;
      pLife[i] = pMax[i] = 0.3 + Math.random() * 0.55; pSize0[i] = 2 + Math.random() * 3; pKind[i] = kind || 0;
    };
    const burst = (n, speed) => { for (let i = 0; i < n; i++) sparkAt(outlineWorld(), speed); };
    const updateSparks = (dt) => {
      for (let i = 0; i < MAXP; i++) {
        if (pLife[i] <= 0) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; pSize[i] = 0; continue; }
        pLife[i] -= dt;
        const k = Math.max(0, pLife[i] / pMax[i]);
        pVel[i * 3 + 1] -= 3.2 * dt; pVel[i * 3] *= 0.985; pVel[i * 3 + 1] *= 0.985;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        const f = k * k * 1.7, hot = Math.max(0, k - 0.55) / 0.45; // white-hot at birth, cooling to green (gold for the coin puff)
        if (pKind[i]) { pCol[i * 3] = f; pCol[i * 3 + 1] = (0.68 + 0.32 * hot) * f; pCol[i * 3 + 2] = (0.1 + 0.8 * hot) * f; }
        else { pCol[i * 3] = (0.35 + 0.6 * hot) * f; pCol[i * 3 + 1] = f; pCol[i * 3 + 2] = (0.6 + 0.35 * hot) * f; }
        pSize[i] = pSize0[i] * (0.4 + 0.6 * k);
      }
      pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aColor.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
    };

    // bolts: thin jagged tubes, regenerated every few frames so they crawl and flicker
    const NB = 7, bolts = [];
    for (let i = 0; i < NB; i++) {
      const bm = new THREE.MeshBasicMaterial({ color: 0xc9ffe2, transparent: true, opacity: 1, depthWrite: false });
      bm.toneMapped = false;
      const m = new THREE.Mesh(new THREE.BufferGeometry(), bm); m.visible = false; m.frustumCulled = false; scene.add(m); bolts.push(m);
    }
    const jag = (a, b, n, amp) => {
      const pts = [a.clone()], dir = b.clone().sub(a), len = dir.length(); dir.normalize();
      const perp = new THREE.Vector3(-dir.y, dir.x, 0);
      for (let i = 1; i < n; i++) { const t = i / n; pts.push(a.clone().lerp(b, t).addScaledVector(perp, (Math.random() - 0.5) * amp * len * Math.sin(t * Math.PI))); }
      pts.push(b.clone());
      return pts;
    };
    const setBolt = (m, pts, r, op) => {
      const path = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(path, pts.length * 3, r, 5, false);
      m.material.opacity = op; m.visible = true;
    };
    const regenBolts = (level) => {
      const c = toolsSign.group.position;
      let bi = 0;
      const mains = 2 + (Math.random() < level ? 1 : 0);
      for (let k = 0; k < mains && bi < NB; k++) {
        if (Math.random() > 0.5 + 0.45 * level) continue; // arcs come and go
        const a = outlineWorld(); let b;
        if (Math.random() < 0.6) { // arc between two points on the tools
          let tries = 0; do { b = outlineWorld(); tries++; } while (tries < 8 && (a.distanceTo(b) < 0.5 || a.distanceTo(b) > 1.8));
        } else { // arc jumping off into the air
          const ang = Math.atan2(a.y - c.y, a.x - c.x) + (Math.random() - 0.5) * 1.2, L = 0.45 + Math.random() * 0.7;
          b = a.clone().add(new THREE.Vector3(Math.cos(ang) * L, Math.sin(ang) * L, 0));
        }
        const pts = jag(a, b, 6 + ((Math.random() * 5) | 0), 0.35);
        setBolt(bolts[bi++], pts, 0.013 + Math.random() * 0.01, level * (0.7 + Math.random() * 0.3));
        if (bi < NB && Math.random() < 0.6) { // a fork off the arc
          const from = pts[1 + ((Math.random() * (pts.length - 2)) | 0)], dir = b.clone().sub(a).normalize();
          const ang = Math.atan2(dir.y, dir.x) + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6), L = 0.2 + Math.random() * 0.35;
          setBolt(bolts[bi++], jag(from, from.clone().add(new THREE.Vector3(Math.cos(ang) * L, Math.sin(ang) * L, 0)), 4, 0.4), 0.009, level * (0.5 + Math.random() * 0.3));
        }
        sparkAt(a, 1.2); sparkAt(b, 1.2); if (Math.random() < 0.5) sparkAt(a, 1.6);
      }
      for (; bi < NB; bi++) bolts[bi].visible = false;
    };

    // --- M monogram: red digital rain behind the sign while hovered or briefly after a tap ---
    // Glyphs sit on a fixed grid per column; a bright head travels down each column lighting them up, and
    // they decay behind it (the classic look). Columns respawn above the top at random intervals.
    const mSign = signs.find(s => s.group.userData.mmark);
    const mBox = localBox(mSign, 0.3); // rain columns below are laid out in this same home-relative space
    const inM = (p) => inLocalBox(mSign, mBox, p);
    let rainUntil = 0, rainLevel = 0, wasRain = false;
    const rainTop = mBox.max.y + 0.9, rainBottom = mBox.min.y - 0.9, rainGap = 0.19, rainPad = 0.25;
    const rainW = mBox.max.x - mBox.min.x + rainPad * 2;
    const NROW = Math.ceil((rainTop - rainBottom) / rainGap), NCOL = Math.round(rainW / 0.13), NR = NCOL * NROW;
    const colX = new Float32Array(NCOL), colY = new Float32Array(NCOL), colV = new Float32Array(NCOL), colTail = new Float32Array(NCOL);
    const resetCol = (c, first) => { colY[c] = rainTop + (first ? Math.random() * 1.6 : 0.6 + Math.random() * 2.4); colV[c] = 2.2 + Math.random() * 2.6; colTail[c] = 0.7 + Math.random() * 1.3; };
    for (let c = 0; c < NCOL; c++) { colX[c] = mBox.min.x - rainPad + (c + 0.5) * (rainW / NCOL); resetCol(c, true); }
    const rPos = new Float32Array(NR * 3), rCol = new Float32Array(NR * 3), rAlpha = new Float32Array(NR), rGlyph = new Float32Array(NR);
    for (let i = 0; i < NR; i++) rGlyph[i] = Math.random() < 0.5 ? 0 : 1;
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
    rGeo.setAttribute('aColor', new THREE.BufferAttribute(rCol, 3).setUsage(THREE.DynamicDrawUsage));
    rGeo.setAttribute('aAlpha', new THREE.BufferAttribute(rAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    rGeo.setAttribute('aGlyph', new THREE.BufferAttribute(rGlyph, 1).setUsage(THREE.DynamicDrawUsage));
    const atlas = document.createElement('canvas'); atlas.width = 128; atlas.height = 64; // "0" | "1"
    const actx = atlas.getContext('2d'); actx.fillStyle = '#fff'; actx.font = 'bold 54px "Courier New", Courier, monospace'; actx.textAlign = 'center'; actx.textBaseline = 'middle';
    actx.fillText('0', 32, 34); actx.fillText('1', 96, 34);
    const rTex = new THREE.CanvasTexture(atlas);
    const rMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: rTex }, uScale: { value: (h / worldHeight) * renderer.getPixelRatio() } },
      vertexShader: 'attribute vec3 aColor; attribute float aAlpha; attribute float aGlyph; uniform float uScale; varying vec3 vColor; varying float vAlpha; varying float vGlyph; void main(){ vColor = aColor; vAlpha = aAlpha; vGlyph = aGlyph; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 0.17 * uScale; }',
      fragmentShader: 'uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha; varying float vGlyph; void main(){ float a = texture2D(uTex, vec2((gl_PointCoord.x + vGlyph) * 0.5, 1.0 - gl_PointCoord.y)).a * vAlpha; gl_FragColor = vec4(vColor * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const rain = new THREE.Points(rGeo, rMat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
    this._rainMat = rMat;
    const updateRain = (dt, level) => {
      const z = mSign.group.position.z - 0.15;
      for (let c = 0; c < NCOL; c++) {
        colY[c] -= colV[c] * dt;
        if (colY[c] < rainBottom - colTail[c] * 3) resetCol(c, false);
        for (let k = 0; k < NROW; k++) {
          const i = c * NROW + k, y = rainTop - k * rainGap, d = y - colY[c]; // d > 0: the head has already passed this glyph
          let b = d < -rainGap * 0.5 ? 0 : Math.exp(-Math.max(0, d) / colTail[c]);
          b *= Math.min(1, (rainTop - y) / 0.5) * Math.min(1, (y - rainBottom) / 0.7) * level; // soften the top/bottom edges
          const head = Math.max(0, 1 - Math.abs(d) / rainGap);
          if (b > 0.02 && Math.random() < 0.04) rGlyph[i] = 1 - rGlyph[i];
          rPos[i * 3] = mSign.x + colX[c]; rPos[i * 3 + 1] = mSign.y + y; rPos[i * 3 + 2] = z;
          rCol[i * 3] = 1.2 + 0.4 * head; rCol[i * 3 + 1] = 0.22 + 0.7 * head; rCol[i * 3 + 2] = 0.38 + 0.6 * head;
          rAlpha[i] = b;
        }
      }
      rGeo.attributes.position.needsUpdate = true; rGeo.attributes.aColor.needsUpdate = true; rGeo.attributes.aAlpha.needsUpdate = true; rGeo.attributes.aGlyph.needsUpdate = true;
    };

    // --- question block: hover-enter or tap bumps it ---
    const blockSign = signs.find(s => s.group.userData.block);
    const inBlock = (p) => p && Math.hypot(p.x - blockSign.x, p.y - blockSign.y) < blockSign.baseScale * 1.2;
    blockSign.group.userData.block.onHit = playCoin;
    // coin: lives in the scene so it flies straight up in world space; its tubes share the block's glow modulation
    const coin = blockSign.group.userData.block.coin;
    scene.add(coin);
    coin.traverse(o => { if (o.userData && o.userData.mat) blockSign.mats.push(o.userData.mat); });
    const _puff = new THREE.Vector3();
    blockSign.group.userData.block.onVanish = (p) => { for (let i = 0; i < 10; i++) sparkAt(p, 1.3, 1, _puff.set(p.x, p.y - 0.3, p.z)); };

    this._onDown = (e) => {
      if (e.target !== renderer.domElement) return;
      const p = toWorld(e);
      for (const s of signs) if (s.hit(p)) { s.forwardUntil = performance.now() + 2000; this.setState({ activeSign: s.shape }); }
      if (inRaven(p)) tapOpenUntil = performance.now() + 1400;
      if (inTools(p)) { zapUntil = performance.now() + 1300; burst(16, 2.6); }
      if (inM(p)) rainUntil = performance.now() + 2400;
      if (inBlock(p)) blockSign.group.userData.block.hit(clock.getElapsedTime());
      if (inDie(p)) dieSign.group.userData.die.roll(clock.getElapsedTime());
    };
    container.addEventListener('pointermove', this._onMove);
    container.addEventListener('pointerleave', this._onLeave);
    container.addEventListener('pointerdown', this._onDown);

    // --- resize / reflow ----------------------------------------------
    // the flex-wrap cells moved or resized: refit the canvas to the stage and move each sign to its cell
    this._ro = new ResizeObserver(() => {
      const mm = measure();
      const nw = mm.w, nh = mm.h;
      if (!nw || !nh || !mm.upp) return;
      const wh = nh * mm.upp, ww = nw * mm.upp;
      camera.left = -ww / 2; camera.right = ww / 2; camera.top = wh / 2; camera.bottom = -wh / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      composer.setSize(nw, nh);
      rMat.uniforms.uScale.value = (nh / wh) * renderer.getPixelRatio();
      fogPlane.scale.set(ww, wh, 1); fogMat.uniforms.uHalf.value.set(ww / 2, wh / 2); fogMat.uniforms.uAspect.value = nw / nh;
      this._worldWidth = ww; this._worldHeight = wh;
      signs.forEach((s, i) => Object.assign(s, homeOf(defs[i], mm)));
    });
    this._ro.observe(container);

    // --- animation loop ------------------------------------------------
    let flickerAmount = 0.6, mouseReact = true, driftT = 0; // read live each frame from the settings panel

    const tick = () => {
      if (!this._alive) return;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.getElapsedTime();
      flickerAmount = this._flicker(); mouseReact = this._hover();
      driftT += dt * this.state.drift; // drift clock runs at the chosen speed (0 freezes the signs in place)
      // a hovered/focused nav label (set by hero-ui.js) plays its sign's hover animation
      const navHover = mouseReact ? this._labelHover : null;

      // die: hover-enter or tap rolls it; it homes onto the 20 and rests
      const die = dieSign.group.userData.die;
      const overDie = (mouseReact && inDie(this._mouseWorld)) || navHover === 'd20';
      if (overDie && !die.hovering) die.roll(t);
      die.hovering = overDie;
      die.update(t, dt);

      // question block: hover-enter or tap bumps it
      const block = blockSign.group.userData.block;
      const overBlock = (mouseReact && inBlock(this._mouseWorld)) || navHover === 'qblock';
      if (overBlock && !block.hovering) block.hit(t);
      block.hovering = overBlock;
      block.update(t);

      // wrench & pencil: arcs + sparks while hovered or briefly after a tap
      const zapNow = (mouseReact && inTools(this._mouseWorld)) || navHover === 'tools' || performance.now() < zapUntil;
      if (zapNow && !wasZap) { burst(30, 1.8); playZap(); }
      if (!zapNow && wasZap) { zapSfx.pause(); }
      wasZap = zapNow;
      zapLevel += ((zapNow ? 1 : 0) - zapLevel) * (zapNow ? 0.25 : 0.12);
      if (zapLevel > 0.05) {
        if (performance.now() > nextRegen) { regenBolts(zapLevel); nextRegen = performance.now() + 35 + Math.random() * 60; }
        sparkAcc += dt * 70 * zapLevel;
        while (sparkAcc >= 1) { sparkAcc -= 1; sparkAt(outlineWorld(), 1.0); }
      } else if (zapLevel > 0) { for (const m of bolts) m.visible = false; zapLevel = 0; }
      updateSparks(dt);

      // M monogram: digital rain while hovered or briefly after a tap
      const rainNow = (mouseReact && inM(this._mouseWorld)) || navHover === 'mmark' || performance.now() < rainUntil;
      if (rainNow && !wasRain) playMRain();
      if (!rainNow && wasRain) mRainSfx.pause();
      wasRain = rainNow;
      if (rainNow && rainLevel < 0.01) for (let c = 0; c < NCOL; c++) resetCol(c, true);
      rainLevel += ((rainNow ? 1 : 0) - rainLevel) * (rainNow ? 0.14 : 0.05);
      if (rainLevel > 0.01) { rain.visible = true; updateRain(dt, rainLevel); } else if (rain.visible) { rain.visible = false; rainLevel = 0; }
      const sizeMul = this.state.size;
      const brightMul = this.state.brightness;
      bloomPass.strength = this._bloom() * (0.6 + 0.4 * brightMul);
      if (sizeMul !== this._appliedSize) {
        for (const m of allMeshes) m.userData.rebuild(sizeMul);
        this._appliedSize = sizeMul;
      }

      // beak: ease toward open while hovered or briefly after a tap; each mandible rotates about the beak hinge
      const wantOpen = (mouseReact && inRaven(this._mouseWorld)) || navHover === 'raven' || performance.now() < tapOpenUntil ? 1 : 0;
      if (wantOpen && !wasOpen) playKaw();
      wasOpen = !!wantOpen;
      const nextOpen = beakOpen + (wantOpen - beakOpen) * 0.16;
      if (Math.abs(nextOpen - beakOpen) > 0.002) {
        beakOpen = nextOpen;
        const k = beakOpen < 0.5 ? 4 * beakOpen ** 3 : 1 - Math.pow(-2 * beakOpen + 2, 3) / 2;
        for (const mb of raven.group.userData.mandibles) {
          const a = mb.angle * k, ca = Math.cos(a), sa = Math.sin(a);
          mb.mesh.userData.setPoints(mb.pts.map(p => {
            const dx = p[0] - beakHinge[0], dy = p[1] - beakHinge[1];
            return [beakHinge[0] + dx * ca - dy * sa, beakHinge[1] + dx * sa + dy * ca];
          }));
        }
        // throat feathers: follow the open-file pose, plus get pushed down and out where the swinging beak lands
        for (const mo of raven.group.userData.morphs) {
          mo.mesh.userData.setPoints(mo.from.map((p, i) => {
            const x = p[0] + (mo.to[i][0] - p[0]) * k, y = p[1] + (mo.to[i][1] - p[1]) * k;
            const d = Math.hypot(p[0] - beakTipOpen[0], p[1] - beakTipOpen[1]);
            let w = Math.max(0, 1 - d / 0.44); w = w * w * (3 - 2 * w);
            return [x + 0.08 * w * k, y - 0.3 * w * k];
          }));
        }
      }

      let anyHit = false, hitShape = null;
      for (const s of signs) {
        // depth: each sign rests staggered back in space (restDepth, 0 = front at full size, 1 = furthest back),
        // drifting gently around that spot; hover or tap eases it forward to the front. The camera is orthographic,
        // so distance is carried by scale and a dimmer glow, plus a matching z shift and a faint sway.
        const dp = driftT * s.driftSpeed + s.driftPhase;
        const isHit = s.hit(this._mouseWorld);
        if (isHit) { anyHit = true; if (!hitShape) hitShape = s.shape; }
        const wantFwd = (mouseReact && isHit) || navHover === s.shape || performance.now() < s.forwardUntil ? 1 : 0;
        s.forward += (wantFwd - s.forward) * (wantFwd ? 0.1 : 0.04);
        const depth = Math.max(0, Math.min(1, s.restDepth + 0.1 * Math.sin(dp))) * (1 - s.forward);
        s.group.scale.setScalar(s.baseScale * (1 - 0.5 * depth));
        if (s === signs[signs.length - 1]) {
          renderer.domElement.style.cursor = (mouseReact && anyHit) ? 'pointer' : 'default';
          // native tooltip from content.json → signs.<name>.hover; only written on change so the browser can show it
          const tip = (mouseReact && hitShape && this.signInfo[hitShape] && this.signInfo[hitShape].hover) || '';
          if (renderer.domElement.title !== tip) renderer.domElement.title = tip;
        }
        s.group.position.set(s.x + this._orbitR * Math.cos(dp * 0.6 + s.driftPhase), s.y + this._orbitR * Math.sin(dp * 0.6 + s.driftPhase), s.frontZ - 2.6 * depth);
        if (s === blockSign) s.group.position.y += block.hop;
        let intensity = 1 - 0.35 * depth;

        // slow breathing pulse
        intensity += Math.sin(t * s.pulseSpeed + s.pulsePhase) * 0.16;

        // constant subtle buzz
        intensity += (Math.sin(t * 37 + s.flickerSeed) * 0.5 + Math.sin(t * 53 + s.flickerSeed) * 0.5) * 0.02;

        // occasional flicker dropout event
        if (t > s.nextFlickerAt && t < s.flickerUntil) {
          const local = (t - s.nextFlickerAt) * 22;
          intensity *= 0.25 + 0.75 * Math.abs(Math.sin(local));
        } else if (t >= s.flickerUntil && s.flickerUntil > 0) {
          s.nextFlickerAt = t + 2 + Math.random() * 5;
          s.flickerUntil = 0;
        } else if (t > s.nextFlickerAt && s.flickerUntil === 0) {
          s.flickerUntil = t + 0.15 + Math.random() * 0.2;
        }
        intensity = 1 - (1 - intensity) * flickerAmount - (intensity > 1 ? 0 : 0);

        // mouse proximity boost
        let targetBoost = 0;
        if (mouseReact && this._mouseWorld) {
          const dx = s.x - this._mouseWorld.x, dy = s.y - this._mouseWorld.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radius = 2.4;
          targetBoost = Math.max(0, 1 - dist / radius);
          targetBoost = targetBoost * targetBoost * 0.8;
        }
        s.boost += (targetBoost - s.boost) * 0.12;

        const zapKick = s === toolsSign ? zapLevel * (0.3 + 0.35 * Math.random()) : 0; // tubes surge and jitter while arcing
        const rainKick = s === mSign ? rainLevel * 0.35 : 0; // the M glows harder while the rain runs
        const bumpKick = s === blockSign ? block.flash : 0; // the block flashes when bumped
        const finalIntensity = Math.max(0.1, (intensity + s.boost + zapKick + rainKick + bumpKick) * brightMul);
        for (const m of s.mats) {
          const base = m.userData.baseColor;
          m.color.setRGB(base.r * finalIntensity, base.g * finalIntensity, base.b * finalIntensity);
        }
        // feed the fog: where the sign is, how big it is, how hard it is glowing right now, and its color
        const si = signs.indexOf(s), sc = s.signColor;
        fogLights[si * 4] = s.group.position.x; fogLights[si * 4 + 1] = s.group.position.y; fogLights[si * 4 + 2] = s.group.scale.x; fogLights[si * 4 + 3] = finalIntensity;
        fogColors[si * 3] = sc.r; fogColors[si * 3 + 1] = sc.g; fogColors[si * 3 + 2] = sc.b;
      }
      fogMat.uniforms.uTime.value = t;
      fogMat.uniforms.uDensity.value = this._fog();

      block.placeCoin(t);
      composer.render();
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }

}
