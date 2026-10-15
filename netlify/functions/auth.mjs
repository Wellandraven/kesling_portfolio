// Starts "Sign in with GitHub" for the CMS (opened in a popup by js/admin.js).
// Needs Netlify env vars GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (see README → Admin / CMS setup).
export default async (req) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    return new Response('CMS login is not configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Netlify.', {
      status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${origin}/.netlify/functions/callback`);
  authorize.searchParams.set('scope', process.env.GITHUB_SCOPE || 'public_repo');
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `cms_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/.netlify/functions`,
      'Cache-Control': 'no-store'
    }
  });
};
