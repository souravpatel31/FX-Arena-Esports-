import { Capacitor } from '@capacitor/core';

export const APP_SHARE_TITLE = 'FX Arena eSport';

export const FALLBACK_APK_RELEASE_URL =
  'https://github.com/souravpatel31/FX-Arena-Esports-/releases/latest/download/FX-Arena-Esports.apk';

export const DEFAULT_PUBLIC_ORIGIN = 'https://khel-galli-ecsu.vercel.app';

export function isBlockedShareUrl(rawUrl?: string | null): boolean {
  const url = (rawUrl || '').trim().toLowerCase();
  if (!url) return true;
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('ais-dev') ||
    url.includes('capacitor://') ||
    url.startsWith('file://') ||
    url.includes('secret-scanner-g7cvm.web.app') ||
    url.includes('github')
  );
}

export function getCleanPublicOrigin(appSettings?: any): string {
  const configuredBase = (appSettings?.referral?.baseUrl || '').replace(/\/$/, '').trim();
  if (!isBlockedShareUrl(configuredBase)) {
    return configuredBase;
  }

  const envSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '').trim();
  if (!isBlockedShareUrl(envSiteUrl)) {
    return envSiteUrl;
  }

  if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
    const winOrigin = (window.location.origin || '').replace(/\/$/, '').trim();
    if (!isBlockedShareUrl(winOrigin)) {
      return winOrigin;
    }
  }

  return DEFAULT_PUBLIC_ORIGIN;
}

export function getCleanShareDownloadUrl(appSettings?: any, referralCode?: string): string {
  const origin = getCleanPublicOrigin(appSettings);
  const customApkUrl = (appSettings?.referral?.apkDownloadUrl || '').trim();
  const envApkUrl = (import.meta.env.VITE_APK_DOWNLOAD_URL || '').trim();

  if (referralCode && referralCode.trim()) {
    return `${origin}/download?ref=${encodeURIComponent(referralCode.trim())}`;
  }

  if (!isBlockedShareUrl(customApkUrl)) {
    return customApkUrl;
  }

  if (!isBlockedShareUrl(envApkUrl)) {
    return envApkUrl;
  }

  return `${origin}/download`;
}

export function buildAppSharePayload(appSettings?: any, referralCode?: string) {
  const url = getCleanShareDownloadUrl(appSettings, referralCode);
  return {
    title: APP_SHARE_TITLE,
    text: APP_SHARE_TITLE,
    url,
    copyText: `${APP_SHARE_TITLE}\n${url}`,
  };
}

export function getDownloadButtonHref(appSettings?: any): { href: string; isReady: boolean } {
  const customApkUrl = (appSettings?.referral?.apkDownloadUrl || '').trim();
  const envApkUrl = (import.meta.env.VITE_APK_DOWNLOAD_URL || '').trim();

  // If an admin set a custom non-GitHub direct URL, use it directly
  if (customApkUrl && !customApkUrl.includes('localhost') && !customApkUrl.includes('github')) {
    return { href: customApkUrl, isReady: true };
  }

  // On our web server (Vercel or Express), proxy via /api/download-apk so no GitHub URL is exposed in the DOM
  const hasServerApi =
    typeof window !== 'undefined' &&
    !Capacitor.isNativePlatform() &&
    window.location.protocol.startsWith('http') &&
    !window.location.hostname.endsWith('github.io');

  if (hasServerApi) {
    return { href: '/api/download-apk', isReady: true };
  }

  const directUrl =
    (customApkUrl && !customApkUrl.includes('localhost') ? customApkUrl : '') ||
    envApkUrl ||
    FALLBACK_APK_RELEASE_URL;

  return { href: directUrl, isReady: Boolean(directUrl) };
}
