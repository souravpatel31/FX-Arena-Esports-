const base = import.meta.env.BASE_URL || '/';

export function withBase(path: string): string {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}/${cleanPath}`;
}

export const APP_LOGO_URL = withBase('assets/aistudio/fx_arena_icon_512_8f7073a7.png');
export const WELCOME_SPLASH_URL = withBase('assets/aistudio/fx-welcome_31ecf10b.png');
