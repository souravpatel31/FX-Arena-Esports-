import {
  collection,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, setFirestoreHealth, OperationType } from '../lib/firebase';
import { AppNotification } from '../types';

const STORAGE_PREFIX = 'fx_c2_';

interface CacheRecord<T> {
  ts: number;
  data: T;
}

const memoryCache = new Map<string, CacheRecord<any>>();
const inflightMap = new Map<string, Promise<any>>();

export function readStoredCache<T>(key: string): CacheRecord<T> | null {
  const mem = memoryCache.get(key);
  if (mem) return mem as CacheRecord<T>;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRecord<T>;
    if (parsed && typeof parsed.ts === 'number' && 'data' in parsed) {
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function writeStoredCache<T>(key: string, data: T, persist = true): void {
  const rec: CacheRecord<T> = { ts: Date.now(), data };
  memoryCache.set(key, rec);
  if (!persist) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(rec));
  } catch {
    // ignore localStorage quota overflow
  }
}

export function invalidateFirestoreCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    memoryCache.clear();
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
      });
    } catch {
      // ignore
    }
    return;
  }

  for (const key of Array.from(memoryCache.keys())) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      memoryCache.delete(key);
    }
  }
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(`${STORAGE_PREFIX}${prefixOrKey}`)) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    // ignore
  }
}

export async function cachedGetDocs<T = any>(
  key: string,
  q: Query,
  ttlMs: number,
  options?: {
    forceRefresh?: boolean;
    persist?: boolean;
    maxPersist?: number;
    pathLabel?: string;
    legacyStorageKey?: string;
    mapDoc?: (docSnap: QueryDocumentSnapshot) => T;
  }
): Promise<T[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  const persist = options?.persist ?? true;
  const maxPersist = options?.maxPersist;
  const cached = readStoredCache<T[]>(key);

  if (!forceRefresh && cached && Date.now() - cached.ts < ttlMs) {
    return cached.data;
  }

  const inflightKey = `docs:${key}`;
  if (!forceRefresh && inflightMap.has(inflightKey)) {
    return inflightMap.get(inflightKey)!;
  }

  const promise = (async (): Promise<T[]> => {
    try {
      const snap = await getDocs(q);
      setFirestoreHealth('operational');
      const items = snap.docs.map((d) =>
        options?.mapDoc ? options.mapDoc(d) : ({ id: d.id, ...d.data() } as T)
      );
      const persistSlice = maxPersist ? items.slice(0, maxPersist) : items;
      writeStoredCache(key, persistSlice, persist);
      if (options?.legacyStorageKey) {
        try {
          localStorage.setItem(options.legacyStorageKey, JSON.stringify(persistSlice));
        } catch {
          // ignore
        }
      }
      return items;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, options?.pathLabel || key);
      if (cached) return cached.data;
      if (options?.legacyStorageKey) {
        try {
          const raw = localStorage.getItem(options.legacyStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed as T[];
          }
        } catch {
          // ignore
        }
      }
      return [];
    } finally {
      inflightMap.delete(inflightKey);
    }
  })();

  inflightMap.set(inflightKey, promise);
  return promise;
}

export async function cachedGetDoc<T = any>(
  key: string,
  ref: DocumentReference,
  ttlMs: number,
  options?: {
    forceRefresh?: boolean;
    persist?: boolean;
    pathLabel?: string;
  }
): Promise<T | null> {
  const forceRefresh = options?.forceRefresh ?? false;
  const persist = options?.persist ?? true;
  const cached = readStoredCache<T | null>(key);

  if (!forceRefresh && cached && Date.now() - cached.ts < ttlMs) {
    return cached.data;
  }

  const inflightKey = `doc:${key}`;
  if (!forceRefresh && inflightMap.has(inflightKey)) {
    return inflightMap.get(inflightKey)!;
  }

  const promise = (async (): Promise<T | null> => {
    try {
      const snap = await getDoc(ref);
      setFirestoreHealth('operational');
      const data = snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
      writeStoredCache(key, data, persist);
      return data;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, options?.pathLabel || ref.path);
      return cached ? cached.data : null;
    } finally {
      inflightMap.delete(inflightKey);
    }
  })();

  inflightMap.set(inflightKey, promise);
  return promise;
}

// --- Shared Notification Stream (eliminates duplicate listeners in HomeHeader, GlobalNotificationListener & NotificationsModal) ---
const NOTIF_CACHE_KEY = 'shared_notifications_v1';
type NotifSubscriber = (list: AppNotification[]) => void;

const notifSubscribers = new Set<NotifSubscriber>();
let sharedNotifUnsub: (() => void) | null = null;
let sharedNotifUserId: string | null = null;
let latestNotifications: AppNotification[] = readStoredCache<AppNotification[]>(NOTIF_CACHE_KEY)?.data || [];

function startSharedNotifications(userId: string) {
  if (sharedNotifUnsub && sharedNotifUserId === userId) return;
  if (sharedNotifUnsub) {
    sharedNotifUnsub();
    sharedNotifUnsub = null;
  }
  sharedNotifUserId = userId;
  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(15));
  sharedNotifUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty && snapshot.metadata.fromCache) return;
      setFirestoreHealth('operational');
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      latestNotifications = list;
      writeStoredCache(NOTIF_CACHE_KEY, list, true);
      notifSubscribers.forEach((cb) => {
        try {
          cb(list);
        } catch {
          // ignore
        }
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    }
  );
}

export function subscribeSharedNotifications(
  userId: string | undefined,
  cb: NotifSubscriber
): () => void {
  if (!userId) {
    cb([]);
    return () => {};
  }
  notifSubscribers.add(cb);
  cb(latestNotifications);
  startSharedNotifications(userId);

  return () => {
    notifSubscribers.delete(cb);
    if (notifSubscribers.size === 0 && sharedNotifUnsub) {
      sharedNotifUnsub();
      sharedNotifUnsub = null;
      sharedNotifUserId = null;
    }
  };
}
