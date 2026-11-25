/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APK_DOWNLOAD_URL?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_BUILD_NUMBER?: string;
  readonly VITE_APP_BUILD_ID?: string;
  readonly VITE_GITHUB_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD_NUMBER__: number;
declare const __APP_BUILD_ID__: string;
declare const __GITHUB_REPO__: string;
