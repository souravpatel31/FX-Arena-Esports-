const base = import.meta.env.BASE_URL || '/';

export function withBase(path: string): string {
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}/${cleanPath}`;
}

export const APP_LOGO_URL = withBase('fx-arena-logo.png');
export const WELCOME_SPLASH_URL = withBase('fx-arena-welcome.png');
export const MODE_BR_URL = withBase('mode-br.jpg');
export const MODE_CS_URL = withBase('mode-cs.jpg');
export const MODE_LW_URL = withBase('mode-lw.jpg');

export function isDeadPlaceholderImage(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return true;
  return trimmed.includes('i.ibb.co/v4v8q5n/freefire.jpg');
}

export function resolveSafeModeImage(url?: string | null, hint?: string | null): string {
  if (!isDeadPlaceholderImage(url)) {
    return url!.trim();
  }
  const lower = (hint || '').toLowerCase();
  if (lower.includes('cs') || lower.includes('clash') || lower.includes('4v4')) {
    return MODE_CS_URL;
  }
  if (lower.includes('lone') || lower.includes('wolf') || lower.includes('1v1') || lower.includes('sniper')) {
    return MODE_LW_URL;
  }
  return MODE_BR_URL;
}

