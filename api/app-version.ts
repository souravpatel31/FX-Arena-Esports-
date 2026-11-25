import fs from 'fs';
import path from 'path';

const DEFAULT_GITHUB_REPO = 'souravpatel31/FX-Arena-Esports-';
const DEFAULT_PUBLIC_ORIGIN = 'https://fx-arena-esports.vercel.app';
const CACHE_TTL_MS = 60 * 1000;

let cachedPayload: any = null;
let cachedAt = 0;

function parseBuildNumberFromTag(tag: string): number {
  const clean = String(tag || '').trim();
  const dotted = clean.match(/(\d+)$/);
  return dotted ? Number(dotted[1]) || 0 : 0;
}

function sanitizeReleaseNotes(rawBody?: string): string {
  const text = String(rawBody || '').trim();
  if (!text) return '';
  if (text.startsWith('Official signed Release Android APK for FX Arena eSport')) {
    return 'New game update, performance improvements & latest bug fixes are ready.';
  }
  return text.slice(0, 400);
}

function readDistVersionManifest() {
  try {
    const manifestPath = path.join(process.cwd(), 'dist', 'version.json');
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
  } catch {
    // ignore missing dist manifest
  }
  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const forceRefresh = req.query?.refresh === '1';
  if (!forceRefresh && cachedPayload && Date.now() - cachedAt < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return res.status(200).json(cachedPayload);
  }

  const githubRepo = (
    process.env.GITHUB_REPO ||
    process.env.VITE_GITHUB_REPO ||
    DEFAULT_GITHUB_REPO
  ).trim();

  const fallbackApkUrl = `https://github.com/${githubRepo}/releases/latest/download/FX-Arena-Esports.apk`;
  const distManifest = readDistVersionManifest();

  let apkVersion = String(distManifest?.version || process.env.VITE_APP_VERSION || '').trim();
  let apkBuildNumber = Number(distManifest?.buildNumber || process.env.VITE_APP_BUILD_NUMBER || 0) || 0;
  let directApkUrl = (process.env.APK_DOWNLOAD_URL || process.env.VITE_APK_DOWNLOAD_URL || fallbackApkUrl).trim();
  let releaseNotes = '';
  let publishedAt = '';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const ghRes = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'FX-Arena-Esports-Updater',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (ghRes.ok) {
      const ghData: any = await ghRes.json();
      const tagName = String(ghData?.tag_name || '').trim();
      const parsedBuild = parseBuildNumberFromTag(tagName);
      if (tagName) {
        apkVersion = tagName.replace(/^v/i, '');
      }
      if (parsedBuild > 0) {
        apkBuildNumber = parsedBuild;
      }
      const apkAsset = Array.isArray(ghData?.assets)
        ? ghData.assets.find((a: any) => String(a?.name || '').toLowerCase().endsWith('.apk'))
        : null;
      if (apkAsset?.browser_download_url && !process.env.APK_DOWNLOAD_URL) {
        directApkUrl = String(apkAsset.browser_download_url);
      }
      releaseNotes = sanitizeReleaseNotes(ghData?.body);
      publishedAt = String(ghData?.published_at || '');
    }
  } catch {
    // Fall back silently to env / dist manifest values
  }

  const cleanOrigin = (
    process.env.APP_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    DEFAULT_PUBLIC_ORIGIN
  )
    .replace(/\/$/, '')
    .trim();

  const apkDownloadUrl =
    process.env.APK_DOWNLOAD_URL && !process.env.APK_DOWNLOAD_URL.includes('github')
      ? process.env.APK_DOWNLOAD_URL.trim()
      : `${cleanOrigin}/api/download-apk${apkBuildNumber > 0 ? `?v=${apkBuildNumber}` : ''}`;

  const webBuildId = String(
    distManifest?.buildId || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''
  ).trim();
  const webVersion = String(distManifest?.version || apkVersion || '').trim();

  const payload = {
    success: true,
    apkVersion: apkVersion || '1.0.0',
    apkBuildNumber,
    apkDownloadUrl,
    directApkUrl,
    releaseNotes,
    publishedAt,
    webVersion: webVersion || '1.0.0',
    webBuildId,
    checkedAt: new Date().toISOString(),
  };

  cachedPayload = payload;
  cachedAt = Date.now();

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return res.status(200).json(payload);
}
