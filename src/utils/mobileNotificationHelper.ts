import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { APP_LOGO_URL, withBase } from './assetUrl';

const INAPP_NOTIF_STORAGE_KEY = 'fx_inapp_notifications_enabled';
const ANDROID_CHANNEL_ID = 'fx_arena_alerts';

function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function ensureNativeNotificationChannel(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'FX Arena eSport Match & IDP Alerts',
      description: 'Room ID, Password and tournament updates',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Channel creation can be skipped on platforms without channels (e.g., iOS)
  }
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermission> {
  if (typeof window === 'undefined') return 'default';

  if (isNativeApp()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') return 'granted';
      if (perm.display === 'denied') return 'denied';
      return 'default';
    } catch {
      return localStorage.getItem(INAPP_NOTIF_STORAGE_KEY) === 'true' ? 'granted' : 'default';
    }
  }

  if ('Notification' in window) {
    return Notification.permission;
  }

  return localStorage.getItem(INAPP_NOTIF_STORAGE_KEY) === 'true' ? 'granted' : 'default';
}

// Register Service Worker / Native Notification Channel
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;

  if (isNativeApp()) {
    await ensureNativeNotificationChannel();
    return null;
  }

  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(withBase('sw.js'), {
      scope: import.meta.env.BASE_URL || '/',
    });
    return registration;
  } catch {
    return null;
  }
}

// Request Notification Permission cleanly across Android APK & Web (never throws unsupported alert)
export async function requestMobileNotificationPermission(userId?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined') return 'default';

  try {
    if (isNativeApp()) {
      await ensureNativeNotificationChannel();
      const result = await LocalNotifications.requestPermissions();
      if (result.display === 'granted') {
        localStorage.setItem(INAPP_NOTIF_STORAGE_KEY, 'true');
        if (userId) {
          await updateDoc(doc(db, 'users', userId), {
            fcmEnabled: true,
            notificationsEnabled: true,
          }).catch(() => {});
        }

        await triggerMobileStatusBarNotification(
          'FX Arena eSport Notifications Active',
          'You will now receive match alerts & Room IDP notifications.',
          { tag: 'welcome-notification' }
        );
        return 'granted';
      }
      return result.display === 'denied' ? 'denied' : 'default';
    }

    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem(INAPP_NOTIF_STORAGE_KEY, 'true');
        await registerNotificationServiceWorker();
        if (userId) {
          await updateDoc(doc(db, 'users', userId), {
            fcmEnabled: true,
            notificationsEnabled: true,
          }).catch(() => {});
        }
        await triggerMobileStatusBarNotification(
          'FX Arena eSport Notifications Active',
          'You will now receive match updates & Room IDP notifications.',
          { tag: 'welcome-notification' }
        );
      }
      return permission;
    }

    // Fallback for embedded WebViews or browsers without window.Notification:
    // Enable In-App Live Notifications cleanly without showing any error alert
    localStorage.setItem(INAPP_NOTIF_STORAGE_KEY, 'true');
    if (userId) {
      await updateDoc(doc(db, 'users', userId), {
        fcmEnabled: true,
        notificationsEnabled: true,
      }).catch(() => {});
    }
    return 'granted';
  } catch {
    localStorage.setItem(INAPP_NOTIF_STORAGE_KEY, 'true');
    if (userId) {
      await updateDoc(doc(db, 'users', userId), {
        fcmEnabled: true,
        notificationsEnabled: true,
      }).catch(() => {});
    }
    return 'granted';
  }
}

export interface MobileNotificationOptions {
  tag?: string;
  targetMatchId?: string;
  actionPage?: string;
  icon?: string;
  badge?: string;
  data?: any;
}

// Trigger Native Mobile Status Bar / Browser Notification
export async function triggerMobileStatusBarNotification(
  title: string,
  body: string,
  options: MobileNotificationOptions = {}
) {
  if (typeof window === 'undefined') return;

  if (isNativeApp()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await ensureNativeNotificationChannel();
      const notifNumericId = Math.floor(100000 + Math.random() * 2000000000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifNumericId,
            title,
            body,
            channelId: ANDROID_CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 250) },
            extra: {
              targetMatchId: options.targetMatchId || '',
              actionPage: options.actionPage || '',
              ...(options.data || {}),
            },
          },
        ],
      });
    } catch (err) {
      console.warn('Capacitor local notification trigger failed:', err);
    }
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notifData = {
    url: window.location.origin,
    targetMatchId: options.targetMatchId,
    actionPage: options.actionPage,
    ...(options.data || {}),
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: options.icon || APP_LOGO_URL,
          badge: options.badge || APP_LOGO_URL,
          vibrate: [250, 100, 250, 100, 250],
          tag: options.tag || `fx-arena-${Date.now()}`,
          renotify: true,
          data: notifData,
        } as any);
        return;
      }
    }

    new Notification(title, {
      body,
      icon: options.icon || APP_LOGO_URL,
      tag: options.tag || `fx-arena-${Date.now()}`,
    });
  } catch (err) {
    console.warn('Web notification trigger failed:', err);
  }
}
