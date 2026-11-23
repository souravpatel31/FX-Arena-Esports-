const base = import.meta.env.BASE_URL || '/';

export function withBase(path: string): string {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}/${cleanPath}`;
}

export const APP_LOGO_URL = withBase('fx-arena-logo.png');
export const WELCOME_SPLASH_URL = withBase('fx-arena-welcome.png');
