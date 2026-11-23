const DEFAULT_APK_TARGET =
  'https://github.com/souravpatel31/FX-Arena-Esports-/releases/latest/download/FX-Arena-Esports.apk';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const targetUrl = (process.env.APK_DOWNLOAD_URL || process.env.VITE_APK_DOWNLOAD_URL || DEFAULT_APK_TARGET).trim();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'attachment; filename="FX-Arena-Esports.apk"');
  return res.redirect(302, targetUrl);
}
