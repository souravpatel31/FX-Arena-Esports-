import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Suppress internal WebChannel/RPC console noise; handleFirestoreError handles user-facing health & structured logging
setLogLevel('silent');

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      try {
        return initializeFirestore(
          app,
          {
            localCache: memoryLocalCache(),
            experimentalAutoDetectLongPolling: true,
          },
          firebaseConfig.firestoreDatabaseId
        );
      } catch {
        return getFirestore(app, firebaseConfig.firestoreDatabaseId);
      }
    }
  }
}

export const db = createFirestoreInstance();
export const storage = getStorage(app);

let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  authInstance = getAuth(app);
  setPersistence(authInstance, browserLocalPersistence).catch(() => {});
}
export const auth = authInstance;

export type FirestoreHealthState = 'operational' | 'quota_exceeded' | 'offline' | 'permission_denied';

let currentFirestoreHealth: FirestoreHealthState = 'operational';
const healthListeners = new Set<(state: FirestoreHealthState) => void>();

export function getFirestoreHealth(): FirestoreHealthState {
  return currentFirestoreHealth;
}

export function setFirestoreHealth(state: FirestoreHealthState) {
  if (currentFirestoreHealth === state) return;
  currentFirestoreHealth = state;
  healthListeners.forEach((cb) => {
    try {
      cb(state);
    } catch {
      // ignore listener error
    }
  });
}

export function subscribeFirestoreHealth(cb: (state: FirestoreHealthState) => void): () => void {
  healthListeners.add(cb);
  cb(currentFirestoreHealth);
  return () => {
    healthListeners.delete(cb);
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let hasLoggedQuotaNotice = false;
let hasLoggedOfflineNotice = false;
const loggedErrorKeys = new Set<string>();

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode =
    error && typeof error === 'object' && 'code' in error && typeof (error as any).code === 'string'
      ? String((error as any).code).toLowerCase()
      : '';
  const lower = errorMessage.toLowerCase();

  if (
    errorCode === 'resource-exhausted' ||
    lower.includes('resource-exhausted') ||
    lower.includes('quota') ||
    lower.includes('429')
  ) {
    setFirestoreHealth('quota_exceeded');
    if (!hasLoggedQuotaNotice) {
      hasLoggedQuotaNotice = true;
      console.debug(`Firestore quota fallback active (${operationType} on ${path})`);
    }
    return;
  }

  // Ignore offline/transient reachability errors to prevent app crash & console flooding
  if (
    errorCode === 'unavailable' ||
    errorCode === 'deadline-exceeded' ||
    errorCode === 'aborted' ||
    errorCode === 'cancelled' ||
    lower.includes('could not reach cloud firestore') ||
    lower.includes('client is offline') ||
    lower.includes('offline') ||
    lower.includes('unavailable') ||
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout')
  ) {
    setFirestoreHealth('offline');
    if (!hasLoggedOfflineNotice) {
      hasLoggedOfflineNotice = true;
      console.debug(`Firestore offline cache fallback active (${operationType} on ${path})`);
    }
    return;
  }

  if (errorCode === 'permission-denied' || lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    setFirestoreHealth('permission_denied');
    // Skip transient sign-out/startup permission errors before auth is established
    if (!auth.currentUser) {
      return;
    }
  }

  const dedupeKey = `${operationType}:${path || ''}:${errorCode || lower.slice(0, 60)}`;
  if (loggedErrorKeys.has(dedupeKey)) {
    return;
  }
  loggedErrorKeys.add(dedupeKey);

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

