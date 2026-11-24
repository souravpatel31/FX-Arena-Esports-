const DEFAULT_PUBLIC_ORIGIN = 'https://fx-arena-esports.vercel.app';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function handler(req: any, res: any) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const origin =
    host && !host.includes('localhost') && !host.includes('127.0.0.1')
      ? `${proto}://${host}`.replace(/\/$/, '')
      : DEFAULT_PUBLIC_ORIGIN;

  const rawRef = typeof req.query?.ref === 'string' ? req.query.ref.trim() : '';
  const ref = rawRef.slice(0, 80);

  const reqPath = typeof req.url === 'string' && req.url.startsWith('/download') ? req.url : (ref ? `/download?ref=${encodeURIComponent(ref)}` : '/download');
  const shareUrl = `${origin}${reqPath.startsWith('/api/') ? (ref ? `/download?ref=${encodeURIComponent(ref)}` : '/download') : reqPath}`;
  const logoUrl = `${origin}/fx-arena-logo.png?v=3`;

  const title = 'FX Arena – Official APK Download';
  const description = ref
    ? `Invited by @${ref} — Download the official FX Arena Android APK. Join daily Free Fire custom room tournaments and win instant rewards.`
    : 'Download the official FX Arena Android APK. Join daily Free Fire custom room tournaments and win instant rewards.';

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(shareUrl);
  const safeLogo = escapeHtml(logoUrl);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FX Arena" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:image" content="${safeLogo}" />
    <meta property="og:image:secure_url" content="${safeLogo}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:image:alt" content="FX Arena Logo" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeLogo}" />
    <link rel="icon" type="image/png" href="${safeLogo}" />
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeDesc}</p>
      <a href="${safeUrl}">Open FX Arena Download Page</a>
    </main>
  </body>
</html>`);
}
