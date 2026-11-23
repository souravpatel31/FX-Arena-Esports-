/**
 * Image Upload Helper
 * - On Web/Server: uploads original image via /api/upload-image or ImgBB.
 * - In Standalone APK / Offline mode (where /api/upload-image is unavailable):
 *   resizes & compresses cleanly via canvas so the Data URL fits safely under Firestore's 1MB limit.
 */

import { auth } from '../lib/firebase';

const MAX_FIRESTORE_DATA_URL_CHARS = 110_000;

export async function compactImageForFirestore(
  dataUrl: string,
  maxChars: number = MAX_FIRESTORE_DATA_URL_CHARS
): Promise<string> {
  if (!dataUrl.startsWith('data:') || dataUrl.length <= maxChars) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        const maxWidths = [840, 680, 520, 400, 320];
        const qualities = [0.8, 0.68, 0.56, 0.44, 0.34];

        let best = dataUrl;
        for (const maxWidth of maxWidths) {
          const scale = Math.min(1, maxWidth / Math.max(img.width, img.height, 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          canvas.width = w;
          canvas.height = h;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          for (const q of qualities) {
            const webpCandidate = canvas.toDataURL('image/webp', q);
            const jpegCandidate = canvas.toDataURL('image/jpeg', q);
            const candidate =
              webpCandidate.startsWith('data:image/webp') && webpCandidate.length < jpegCandidate.length
                ? webpCandidate
                : jpegCandidate;
            best = candidate;
            if (candidate.length <= maxChars) {
              resolve(candidate);
              return;
            }
          }
        }
        resolve(best);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function uploadOriginalImage(
  fileOrBase64: File | Blob | string,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (typeof fileOrBase64 === 'string') {
    if (
      fileOrBase64.startsWith('http://') ||
      fileOrBase64.startsWith('https://') ||
      fileOrBase64.startsWith('/uploads/')
    ) {
      if (onProgress) onProgress(100);
      return fileOrBase64;
    }
  }

  let base64String: string;
  let fileName = 'match_image.png';

  if (typeof fileOrBase64 === 'string') {
    base64String = fileOrBase64;
  } else {
    fileName = (fileOrBase64 as File).name || 'match_image.png';
    base64String = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read selected gallery file'));
      reader.readAsDataURL(fileOrBase64);
    });
  }

  if (onProgress) onProgress(30);

  const isCapacitorNative =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  const isStaticHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:');

  if (!isCapacitorNative && !isStaticHost) {
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1500);
      try {
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: base64String,
            filename: fileName,
          }),
        });

        if (onProgress) onProgress(70);

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.url) {
            if (onProgress) onProgress(100);
            return data.url;
          }
        }
      } finally {
        window.clearTimeout(timer);
      }
    } catch (err) {
      console.warn('[Upload] Server upload skipped/unavailable, using compact fallback:', err);
    }
  }

  const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
  if (apiKey) {
    try {
      const rawBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
      const formData = new FormData();
      formData.append('image', rawBase64);

      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });
      const imgbbData = await imgbbRes.json();
      if (imgbbData.data?.url) {
        if (onProgress) onProgress(100);
        return imgbbData.data.url;
      }
    } catch (imgbbErr) {
      console.warn('[Upload] Client ImgBB upload error:', imgbbErr);
    }
  }

  if (onProgress) onProgress(80);
  const compacted = await compactImageForFirestore(base64String, MAX_FIRESTORE_DATA_URL_CHARS);
  if (onProgress) onProgress(100);
  return compacted;
}

// Backward-compatibility aliases
export const uploadOrCompressImage = uploadOriginalImage;
export const compressImage = async (file: File | Blob | string): Promise<string> => {
  return uploadOriginalImage(file);
};
