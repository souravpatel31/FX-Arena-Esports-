import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { doc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { cachedGetDoc } from './firestoreCache';
import {
  DEFAULT_PUBLIC_ORIGIN,
  FALLBACK_APK_RELEASE_URL,
  getBackendApiUrl,
  isBlockedShareUrl,
} from './shareLinks';

export interface AppVersionInfo {
  version: string;
  buildNumber: number;
  buildId: string;
}

export interface AppUpdateInfo {
  hasUpdate: boolean;
  isNativeApk: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  currentBuildNumber: number;
  latestVersion: string;
  latestBuildNumber: number;
  downloadUrl: string;
  fallbackDownloadUrl: string;
  title: string;
  message: string;
  source: 'github' | 'admin' | 'web';
}

function getBuildFallbackVersion(): string {
  try {
    return typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function getBuildFallbackNumber(): number {
  try {
    return typeof __APP_BUILD_NUMBER__ !== 'undefined' ? Number(__APP_BUILD_NUMBER__) || 0 : 0;
  } catch {
    return 0;
  }
}

function getBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ !== 'undefined' && __APP_BUILD_ID__ ? String(__APP_BUILD_ID__) : '';
  } catch {
    return '';
  }
}

function getGithubRepo(): string {
  try {
    return typeof __GITHUB_REPO__ !== 'undefined' && __GITHUB_REPO__
      ? String(__GITHUB_REPO__)
      : 'souravpatel31/FX-Arena-Esports-';
  } catch {
    return 'souravpatel31/FX-Arena-Esports-';
  }
}

function parseBuildNumberFromTag(tag?: string): number {
  const m = String(tag || '').trim().match(/(\d+)$/);
  return m ? Number(m[1]) || 0 : 0;
}

function compareSemver(a?: string, b?: string): number {
  const pa = String(a || '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function isDevPreviewHost(): boolean {
  if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return false;
  const h = (window.location.hostname || '').toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.includes('ais-dev') ||
    h.includes('ais-pre')
  );
}

export async function getInstalledAppInfo(): Promise<AppVersionInfo> {
  let version = getBuildFallbackVersion();
  let buildNumber = getBuildFallbackNumber();
  const buildId = getBuildId();

  if (Capacitor.isNativePlatform()) {
    try {
      const info = await CapacitorApp.getInfo();
      if (info?.version) version = String(info.version).trim();
      const nativeBuild = Number(info?.build);
      if (Number.isFinite(nativeBuild) && nativeBuild > 0) {
        buildNumber = nativeBuild;
      }
    } catch {
      // Fall back to compile-time constants
    }
  }

  return {
    version,
    buildNumber,
    buildId,
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 5500): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function checkForAppUpdate(options?: {
  manual?: boolean;
  appSettings?: any;
}): Promise<AppUpdateInfo> {
  const isNativeApk = Capacitor.isNativePlatform();
  const installed = await getInstalledAppInfo();
  const repo = getGithubRepo();
  const devHost = isDevPreviewHost();

  // 1. Check backend /api/app-version (cached 60s on server, bypasses GitHub client limits)
  const apiBaseUrl = getBackendApiUrl('/api/app-version');
  const apiUrl = options?.manual ? `${apiBaseUrl}?refresh=1&t=${Date.now()}` : apiBaseUrl;
  let apiData = await fetchJsonWithTimeout(apiUrl, 6000);

  // 2. Direct GitHub fallback if /api/app-version didn't return a build number
  let directRelease: any = null;
  if (!apiData || !apiData.apkBuildNumber) {
    directRelease = await fetchJsonWithTimeout(
      `https://api.github.com/repos/${repo}/releases/latest`,
      5500
    );
  }

  // 3. Web manifest check for browser / PWA users (same-origin dist/version.json)
  let webManifest: any = null;
  if (!isNativeApk && !devHost) {
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    webManifest = await fetchJsonWithTimeout(`${basePath}/version.json?t=${Date.now()}`, 4500);
  }

  // 4. Optional Firestore admin appUpdate config (reuses cached referral_support doc)
  let settingsData = options?.appSettings;
  if (!settingsData && auth.currentUser) {
    try {
      settingsData = await cachedGetDoc<any>(
        'appSettings_referral_support',
        doc(db, 'appSettings', 'referral_support'),
        5 * 60_000,
        { pathLabel: 'appSettings/referral_support' }
      );
    } catch {
      settingsData = null;
    }
  }

  const adminUpdate = settingsData?.appUpdate || {};
  const adminEnabled = adminUpdate?.enabled !== false;
  const adminMinBuild = adminEnabled ? Number(adminUpdate?.minBuildNumber || 0) || 0 : 0;
  const adminForce = Boolean(adminEnabled && adminUpdate?.forceUpdate);
  const adminTitle = String(adminUpdate?.title || '').trim();
  const adminMessage = String(adminUpdate?.message || '').trim();
  const adminCustomApk = String(adminUpdate?.customApkUrl || '').trim();

  const ghTag = String(directRelease?.tag_name || '').trim();
  const ghBuild = parseBuildNumberFromTag(ghTag);
  const ghVersion = ghTag ? ghTag.replace(/^v/i, '') : '';
  const ghAsset = Array.isArray(directRelease?.assets)
    ? directRelease.assets.find((a: any) => String(a?.name || '').toLowerCase().endsWith('.apk'))
    : null;
  const ghDirectApkUrl = String(ghAsset?.browser_download_url || '').trim();

  const remoteApkBuild = Number(apiData?.apkBuildNumber || ghBuild || 0) || 0;
  const remoteApkVersion = String(apiData?.apkVersion || ghVersion || installed.version).trim();
  const effectiveTargetBuild = Math.max(remoteApkBuild, adminMinBuild);

  const remoteWebBuildId = String(webManifest?.buildId || apiData?.webBuildId || '').trim();
  const remoteWebVersion = String(webManifest?.version || apiData?.webVersion || remoteApkVersion).trim();

  const configuredReferralApk = String(settingsData?.referral?.apkDownloadUrl || '').trim();
  const cleanOrigin = (
    settingsData?.referral?.baseUrl && !isBlockedShareUrl(settingsData.referral.baseUrl)
      ? String(settingsData.referral.baseUrl).replace(/\/$/, '').trim()
      : DEFAULT_PUBLIC_ORIGIN
  );

  const resolvedFallbackUrl =
    String(apiData?.directApkUrl || ghDirectApkUrl || FALLBACK_APK_RELEASE_URL).trim();

  const resolvedDownloadUrl =
    (adminCustomApk.startsWith('https://') ? adminCustomApk : '') ||
    (configuredReferralApk && !isBlockedShareUrl(configuredReferralApk) ? configuredReferralApk : '') ||
    String(apiData?.apkDownloadUrl || '').trim() ||
    `${cleanOrigin}/api/download-apk${effectiveTargetBuild > 0 ? `?v=${effectiveTargetBuild}` : ''}`;

  let hasUpdate = false;
  let source: 'github' | 'admin' | 'web' = 'github';
  let latestVersion = remoteApkVersion || installed.version;
  let latestBuildNumber = effectiveTargetBuild || installed.buildNumber;

  if (isNativeApk) {
    if (effectiveTargetBuild > 0 && installed.buildNumber > 0) {
      hasUpdate = effectiveTargetBuild > installed.buildNumber;
    } else if (remoteApkVersion && installed.version) {
      hasUpdate = compareSemver(remoteApkVersion, installed.version) > 0;
    }
    if (adminMinBuild > 0 && adminMinBuild >= remoteApkBuild && installed.buildNumber < adminMinBuild) {
      source = 'admin';
      if (adminUpdate?.version) latestVersion = String(adminUpdate.version).trim();
    }
  } else {
    if (adminMinBuild > 0 && installed.buildNumber > 0 && adminMinBuild > installed.buildNumber) {
      hasUpdate = true;
      source = 'admin';
      latestVersion = String(adminUpdate?.version || remoteWebVersion || `1.0.${adminMinBuild}`).trim();
      latestBuildNumber = adminMinBuild;
    } else if (!devHost && remoteWebBuildId && installed.buildId && remoteWebBuildId !== installed.buildId) {
      hasUpdate = true;
      source = 'web';
      latestVersion = remoteWebVersion || remoteApkVersion;
      latestBuildNumber = Number(webManifest?.buildNumber || remoteApkBuild || 0) || installed.buildNumber;
    }
  }

  const defaultNotes = isNativeApk
    ? 'A new version of FX Arena eSport is ready with latest updates and bug fixes. Tap Update Now to install the newest APK.'
    : 'A new update is live with latest features and improvements. Tap Update Now to refresh to the newest version.';

  const releaseNotes =
    adminMessage ||
    String(apiData?.releaseNotes || '').trim() ||
    defaultNotes;

  return {
    hasUpdate,
    isNativeApk,
    forceUpdate: adminForce,
    currentVersion: installed.version,
    currentBuildNumber: installed.buildNumber,
    latestVersion,
    latestBuildNumber,
    downloadUrl: resolvedDownloadUrl,
    fallbackDownloadUrl: resolvedFallbackUrl,
    title: adminTitle || 'Game Update Available!',
    message: releaseNotes,
    source,
  };
}

export async function applyWebUpdate(): Promise<void> {
  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.update().catch(() => undefined)));
    }
  } catch {
    // Proceed with reload even if cache clearing is unavailable
  }
  window.location.reload();
}
