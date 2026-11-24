import { Capacitor } from '@capacitor/core';

export const APP_SHARE_TITLE = 'FX Arena';

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
    url.includes('ais-pre') ||
    url.includes('.run.app') ||
    url.includes('aistudio') ||
    url.includes('googleusercontent.com') ||
    url.includes('usercontent.goog') ||
    url.includes('firebaseapp.com') ||
    url.includes('capacitor://') ||
    url.startsWith('file://') ||
    url.includes('secret-scanner-g7cvm') ||
    url.includes('github')
  );
}

export function getCleanPublicOrigin(appSettings?: any): string {
  const configuredBase = (appSettings?.referral?.baseUrl || '').replace(/\/$/, '').trim();
  const envSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '').trim();
  const winOrigin =
    typeof window !== 'undefined' && !Capacitor.isNativePlatform()
      ? (window.location.origin || '').replace(/\/$/, '').trim()
      : '';

  if (winOrigin && !isBlockedShareUrl(winOrigin) && !winOrigin.toLowerCase().includes('khel-galli')) {
    if (!configuredBase || isBlockedShareUrl(configuredBase) || configuredBase.toLowerCase().includes('khel-galli')) {
      return winOrigin;
    }
  }

  if (!isBlockedShareUrl(configuredBase)) {
    return configuredBase;
  }

  if (!isBlockedShareUrl(envSiteUrl)) {
    return envSiteUrl;
  }

  if (winOrigin && !isBlockedShareUrl(winOrigin)) {
    return winOrigin;
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
    url,
    copyText: url,
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

export function getBackendApiUrl(apiPath: string): string {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  if (typeof window === 'undefined') {
    return `${DEFAULT_PUBLIC_ORIGIN}${normalizedPath}`;
  }

  const isNative = Capacitor.isNativePlatform();
  const host = (window.location.hostname || '').toLowerCase();
  const proto = (window.location.protocol || '').toLowerCase();
  const isStaticOrLocalWebView =
    isNative ||
    proto === 'file:' ||
    proto === 'capacitor:' ||
    host.endsWith('github.io') ||
    host === 'secret-scanner-g7cvm.web.app';

  if (isStaticOrLocalWebView) {
    return `${DEFAULT_PUBLIC_ORIGIN}${normalizedPath}`;
  }

  return normalizedPath;
}

