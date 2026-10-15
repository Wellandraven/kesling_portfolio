// CMS: "Sign in with GitHub" at the bottom of the settings panel, and a Content editor that commits
// content.json straight to the repo. Netlify redeploys on each commit. Login runs through
// netlify/functions/auth.mjs + callback.mjs; only accounts with push access to REPO can save.
import { renderContent } from './render-content.js';

const REPO = 'Wellandraven/kesling_portfolio';
const BRANCH = 'main';
const FILE = 'content.json';
const TOKEN_KEY = 'cms.token';

const store = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
  set: (v) => { try { sessionStorage.setItem(TOKEN_KEY, v); } catch (e) {} },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }
};

// UTF-8 safe base64 (content.json has characters like "—" and "é")
const toB64 = (str) => { let bin = ''; for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b); return btoa(bin); };
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

// fields the editor shows: [key, label, multiline]
const SITE_FIELDS = [['name', 'Name'], ['title', 'Page title'], ['description', 'Description', true]];
const SIGN_FIELDS = [['title', 'Drawer title'], ['hover', 'Hover text'], ['text', 'Drawer text', true]];

export function mountAdmin(scene) {
  const q = (s) => document.querySelector(s);
  const on = (sel, fn) => document.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
  const signedOut = q('[data-admin="signed-out"]'), signedIn = q('[data-admin="signed-in"]');
  const adminStatus = q('[data-admin-status]'), userEl = q('[data-admin-user]');
  const editor = q('#cms-editor'), form = q('[data-cms-fields]'), editorStatus = q('[data-cms-status]');
  const saveBtn = q('[data-action="cms-save"]');

  let token = store.get(), user = null, doc = null, sha = null, busy = false;

  const gh = async (path, opts = {}) => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (!res.ok) { const err = new Error(`GitHub ${res.status}`); err.status = res.status; throw err; }
    return res.json();
  };

  function render(status = '') {
    signedOut.hidden = !!user;
    signedIn.hidden = !user;
    if (user) userEl.textContent = '@' + user.login;
    adminStatus.textContent = status;
    adminStatus.hidden = !status;
  }

  async function verify() {
    if (!token) { user = null; render(); return; }
    try {
      const [me, repo] = await Promise.all([gh('/user'), gh(`/repos/${REPO}`)]);
      if (!repo.permissions || !repo.permissions.push) {
        signOut(`@${me.login} has no edit access`);
        return;
      }
      user = me;
      render();
    } catch (e) {
      signOut(e.status === 401 ? 'Session expired. Sign in again' : 'Could not reach GitHub');
    }
  }

  function signOut(status = '') {
    token = null; user = null; store.clear();
    closeEditor();
    render(status);
  }

  function signIn() {
    const w = 600, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2, top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open('/.netlify/functions/auth', 'cms-login', `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) { render('Allow pop-ups to sign in'); return; }
    render('Waiting for GitHub…');
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'cms-auth') return;
    if (e.data.error || !e.data.token) { render('Sign-in failed'); return; }
    token = e.data.token;
    store.set(token);
    verify();
  });

  // --- editor ---------------------------------------------------------
  const field = (path, label, value, multiline) => {
    const wrap = document.createElement('label');
    wrap.className = 'cms-field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (multiline) input.rows = 3; else input.type = 'text';
    input.value = value || '';
    input.dataset.path = path;
    wrap.append(span, input);
    return wrap;
  };
  const group = (title, color) => {
    const fs = document.createElement('fieldset');
    fs.className = 'cms-group';
    if (color) fs.style.setProperty('--sign', color);
    const lg = document.createElement('legend');
    lg.textContent = title;
    fs.append(lg);
    return fs;
  };

  function buildForm() {
    form.replaceChildren();
    const site = group('Site');
    for (const [k, label, multi] of SITE_FIELDS) site.append(field(`site.${k}`, label, doc.site && doc.site[k], multi));
    form.append(site);
    for (const [key, sign] of Object.entries(doc.signs || {})) {
      const color = scene.signInfo[key] && scene.signInfo[key].color;
      const g = group(sign.title || key, color);
      for (const [k, label, multi] of SIGN_FIELDS) g.append(field(`signs.${key}.${k}`, label, sign[k], multi));
      form.append(g);
    }
  }

  async function load(status = '') {
    editorStatus.textContent = 'Loading…';
    form.replaceChildren();
    try {
      const file = await gh(`/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`);
      doc = JSON.parse(fromB64(file.content));
      sha = file.sha;
      buildForm();
      editorStatus.textContent = status;
    } catch (e) {
      editorStatus.textContent = e.status === 401 ? 'Session expired. Sign in again' : 'Could not load content from GitHub';
    }
  }

  function openEditor() {
    if (!user) return;
    scene.setState({ settingsOpen: false });
    editor.hidden = false;
    load();
  }
  function closeEditor() { editor.hidden = true; }

  async function save(e) {
    if (e) e.preventDefault();
    if (busy || !doc) return;
    busy = true; saveBtn.disabled = true;
    editorStatus.textContent = 'Saving…';
    // write edited strings back into the fetched object so any other keys are kept as-is
    for (const input of form.querySelectorAll('[data-path]')) {
      const parts = input.dataset.path.split('.'), last = parts.pop();
      let obj = doc;
      for (const p of parts) obj = obj[p] = obj[p] || {};
      if (input.value || last in obj) obj[last] = input.value;
    }
    try {
      const res = await gh(`/repos/${REPO}/contents/${FILE}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: 'Update content via CMS',
          content: toB64(JSON.stringify(doc, null, 2) + '\n'),
          sha,
          branch: BRANCH
        })
      });
      sha = res.content.sha;
      // show the edits right away; the deployed copy catches up after Netlify rebuilds
      renderContent(doc);
      for (const [key, info] of Object.entries(doc.signs || {})) {
        if (scene.signInfo[key]) scene.signInfo[key] = { ...scene.signInfo[key], ...info };
      }
      editorStatus.textContent = 'Saved. Live in about a minute after Netlify redeploys.';
    } catch (err) {
      if (err.status === 409 || err.status === 422) await load('Content changed on GitHub. Reloaded, please redo your edit');
      else editorStatus.textContent = err.status === 401 ? 'Session expired. Sign in again' : 'Save failed';
    } finally {
      busy = false; saveBtn.disabled = false;
    }
  }

  on('[data-action="cms-signin"]', signIn);
  on('[data-action="cms-signout"]', () => signOut());
  on('[data-action="cms-edit"]', openEditor);
  on('[data-action="cms-close"]', closeEditor);
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', save);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !editor.hidden) closeEditor(); });

  render();
  verify();
}
