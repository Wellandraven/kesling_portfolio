// GitHub redirects here after sign-in. Swaps the one-time code for a token (the client secret never
// leaves the server) and hands the token to the page that opened the popup via postMessage.
const page = (origin, payload) => {
  // JSON inside <script>: escape "<" so a value can never close the tag
  const data = JSON.stringify({ type: 'cms-auth', ...payload }).replace(/</g, '\\u003c');
  const target = JSON.stringify(origin).replace(/</g, '\\u003c');
  const body = `<!doctype html><meta charset="utf-8"><title>Signing in…</title>
<body style="background:#050307;color:#b9b4c6;font:14px Helvetica,Arial,sans-serif;padding:24px">
<p>${payload.error ? 'Sign-in failed. You can close this window.' : 'Signed in. You can close this window.'}</p>
<script>
  if (window.opener) { window.opener.postMessage(${data}, ${target}); window.close(); }
</script>`;
  return new Response(body, {
    status: payload.error ? 400 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'cms_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/.netlify/functions'
    }
  });
};

export default async (req) => {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith('cms_oauth_state='));
  const expected = cookie ? cookie.slice('cms_oauth_state='.length) : '';

  if (url.searchParams.get('error')) return page(origin, { error: url.searchParams.get('error') });
  if (!code || !state || !expected || state !== expected) return page(origin, { error: 'invalid_state' });

  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${origin}/.netlify/functions/callback`
      })
    });
    const data = await res.json();
    if (!data.access_token) return page(origin, { error: data.error || 'token_exchange_failed' });
    return page(origin, { token: data.access_token });
  } catch (e) {
    return page(origin, { error: 'token_exchange_failed' });
  }
};
