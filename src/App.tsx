import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Routes, Route, useNavigate, useLocation, useNavigationType, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Page, User } from './types';
import { closeTopOpenModal } from './hooks/useModalBackHandler';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import { auth, db, handleFirestoreError, setFirestoreHealth, getFirestoreHealth, OperationType } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, onSnapshot, increment, updateDoc, limit } from 'firebase/firestore';
import { GAMES, GAME_MODES_DATA } from './constants';
import { isAuthorizedAdmin, hasControlPanelAccess, STAFF_EMAILS, FREE_MATCH_STAFF_EMAILS } from './utils/adminAuth';
import { WELCOME_SPLASH_URL, resolveSafeModeImage } from './utils/assetUrl';
import { isBlockedShareUrl } from './utils/shareLinks';

// Pages
import Auth from './pages/Auth';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import JoinMatch from './pages/JoinMatch';
import WalletPage from './pages/Wallet';
import AddMoney from './pages/AddMoney';
import Withdraw from './pages/Withdraw';
import ProfilePage from './pages/Profile';
const AdminPage = lazy(() => import('./pages/Admin'));
const AdminUserDetail = lazy(() => import('./pages/AdminUserDetail'));
const AdminEditMatch = lazy(() => import('./pages/AdminEditMatch'));
const AdminCreateMatch = lazy(() => import('./pages/AdminCreateMatch'));
import ReferralPage from './pages/Referral';
import ProfileDetails from './pages/ProfileDetails';
import GameStats from './pages/GameStats';
import GameModes from './pages/GameModes';
const AdminModes = lazy(() => import('./pages/AdminModes'));
import Leaderboard from './pages/Leaderboard';
import MatchDetails from './pages/MatchDetails';
import DownloadApp from './pages/DownloadApp';
import GlobalNotificationListener from './components/GlobalNotificationListener';
import AppUpdateModal from './components/AppUpdateModal';
import { AppUpdateInfo, checkForAppUpdate } from './utils/appUpdater';

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 0,
    winnings: 0,
    bonus: 0,
  },
  isKycVerified: false,
  isAdmin: false,
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  }
};

const pageToPath = {
  [Page.LOGIN]: '/login',
  [Page.SIGNUP]: '/signup',
  [Page.HOME]: '/home',
  [Page.TOURNAMENTS]: '/tournaments',
  [Page.JOIN_MATCH]: '/match',
  [Page.WALLET]: '/wallet',
  [Page.ADD_MONEY]: '/wallet/add',
  [Page.WITHDRAW]: '/wallet/withdraw',
  [Page.PROFILE]: '/profile',
  [Page.ADMIN]: '/admin',
  [Page.ADMIN_USER_PROFILE]: '/admin/user',
  [Page.ADMIN_EDIT_MATCH]: '/admin/match/edit',
  [Page.ADMIN_CREATE_MATCH]: '/admin/match/create',
  [Page.REFERRAL]: '/referral',
  [Page.PROFILE_DETAILS]: '/profile/details',
  [Page.GAME_STATS]: '/profile/stats',
  [Page.GAME_MODES]: '/game-modes',
  [Page.ADMIN_MODES]: '/admin/modes',
  [Page.LEADERBOARD]: '/leaderboard',
  [Page.MATCH_DETAILS]: '/match-details',
  [Page.DOWNLOAD]: '/download'
};

const pathToPage: Record<string, Page> = {
  '/login': Page.LOGIN,
  '/signup': Page.SIGNUP,
  '/home': Page.HOME,
  '/tournaments': Page.TOURNAMENTS,
  '/match': Page.JOIN_MATCH,
  '/match-details': Page.MATCH_DETAILS,
  '/wallet': Page.WALLET,
  '/wallet/add': Page.ADD_MONEY,
  '/wallet/withdraw': Page.WITHDRAW,
  '/profile': Page.PROFILE,
  '/admin': Page.ADMIN,
  '/admin/user': Page.ADMIN_USER_PROFILE,
  '/admin/match/edit': Page.ADMIN_EDIT_MATCH,
  '/admin/match/create': Page.ADMIN_CREATE_MATCH,
  '/referral': Page.REFERRAL,
  '/profile/details': Page.PROFILE_DETAILS,
  '/profile/stats': Page.GAME_STATS,
  '/game-modes': Page.GAME_MODES,
  '/admin/modes': Page.ADMIN_MODES,
  '/leaderboard': Page.LEADERBOARD,
  '/download': Page.DOWNLOAD
};

const USER_CACHE_PREFIX = 'fxarena_user_';

function readCachedUser(uid: string): User | null {
  try {
    const raw = localStorage.getItem(`${USER_CACHE_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id === uid) return parsed as User;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeCachedUser(uid: string, userData: User) {
  try {
    localStorage.setItem(`${USER_CACHE_PREFIX}${uid}`, JSON.stringify(userData));
  } catch {
    // ignore storage quota errors
  }
}

function clearCachedUser(uid?: string) {
  try {
    if (uid) {
      localStorage.removeItem(`${USER_CACHE_PREFIX}${uid}`);
    } else {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(USER_CACHE_PREFIX)) localStorage.removeItem(k);
      });
    }
  } catch {
    // ignore
  }
}

function buildBaselineUser(firebaseUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
}): User {
  const email = (firebaseUser.email || '').toLowerCase();
  return {
    id: firebaseUser.uid,
    username: firebaseUser.displayName || `Gamer_${firebaseUser.uid.slice(0, 5)}`,
    email: firebaseUser.email || '',
    phone: firebaseUser.phoneNumber || '',
    ...DEFAULT_USER_DATA,
    isAdmin: Boolean(isAuthorizedAdmin({ email, uid: firebaseUser.uid })),
  };
}

interface RouteGuardProps {
  isLoggedIn: boolean;
  loading: boolean;
  user: User | null;
  children: React.ReactNode;
}

function ProtectedRoute({ isLoggedIn, loading, user, children }: RouteGuardProps) {
  const authed = isLoggedIn || Boolean(auth.currentUser);
  if (!authed && !loading) {
    return <Navigate to="/login" replace />;
  }
  if (!authed && loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Restoring session...</p>
      </div>
    );
  }
  if (!user && authed) {
    return (
      <div className="flex flex-col items-center justify-center pt-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Loading profile...</p>
      </div>
    );
  }
  return <>{children}</>;
}

function AdminRoute({ isLoggedIn, loading, user, children }: RouteGuardProps) {
  const authed = isLoggedIn || Boolean(auth.currentUser);
  if (!authed && !loading) {
    return <Navigate to="/login" replace />;
  }
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center pt-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Verifying access...</p>
      </div>
    );
  }
  if (!isAuthorizedAdmin(user) || !isAuthorizedAdmin(auth.currentUser)) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

function StaffOrAdminRoute({ isLoggedIn, loading, user, children }: RouteGuardProps) {
  const authed = isLoggedIn || Boolean(auth.currentUser);
  if (!authed && !loading) {
    return <Navigate to="/login" replace />;
  }
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center pt-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Verifying access...</p>
      </div>
    );
  }
  if (!hasControlPanelAccess(user) || !hasControlPanelAccess(auth.currentUser)) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const isNativeApk = Capacitor.isNativePlatform();

  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(auth.currentUser));
  const [user, setUser] = useState<User | null>(() => {
    if (auth.currentUser) {
      return readCachedUser(auth.currentUser.uid) || buildBaselineUser(auth.currentUser);
    }
    return null;
  });
  const [loading, setLoading] = useState(() => !auth.currentUser);
  const [joinedMatchIds, setJoinedMatchIds] = useState<string[]>([]);
  const [exitToastVisible, setExitToastVisible] = useState(false);

  // Never block /download or web auth routes behind a 3s welcome splash
  const isPublicInstantPath = ['/download', '/login', '/signup'].includes(location.pathname);
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(() => {
    if (typeof window === 'undefined') return false;
    const p = window.location.pathname;
    if (p.startsWith('/download') || p === '/login' || p === '/signup') return false;
    return isNativeApk;
  });
  const [splashRunId, setSplashRunId] = useState(1);
  const splashTimerRef = React.useRef<number | null>(null);

  const dismissWelcomeSplash = React.useCallback(() => {
    if (splashTimerRef.current) {
      window.clearTimeout(splashTimerRef.current);
      splashTimerRef.current = null;
    }
    setShowWelcomeSplash(false);
  }, []);

  const pathnameRef = React.useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const isLoggedInRef = React.useRef(isLoggedIn);
  isLoggedInRef.current = isLoggedIn;
  const showWelcomeSplashRef = React.useRef(showWelcomeSplash);
  showWelcomeSplashRef.current = showWelcomeSplash;
  const dismissWelcomeSplashRef = React.useRef(dismissWelcomeSplash);
  dismissWelcomeSplashRef.current = dismissWelcomeSplash;
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const routeHistoryRef = React.useRef<string[]>([location.pathname + location.search]);
  const lastBackPressRef = React.useRef<number>(0);
  const exitToastTimerRef = React.useRef<number | null>(null);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const dismissedUpdateKeyRef = React.useRef<string>('');
  const lastUpdateCheckAtRef = React.useRef<number>(0);

  const runAutomaticUpdateCheck = React.useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastUpdateCheckAtRef.current < 120_000) return;
    lastUpdateCheckAtRef.current = now;
    if (force) setIsCheckingUpdate(true);
    try {
      const info = await checkForAppUpdate({ manual: force });
      if (info.hasUpdate) {
        const updateKey = `${info.latestVersion}_${info.latestBuildNumber}_${info.source}`;
        if (force || info.forceUpdate || dismissedUpdateKeyRef.current !== updateKey) {
          setAppUpdateInfo(info);
          setIsUpdateModalOpen(true);
        }
      } else if (force) {
        setIsUpdateModalOpen(false);
      }
    } catch {
      // Ignore transient offline errors
    } finally {
      if (force) setIsCheckingUpdate(false);
    }
  }, []);

  // Auto-check for app updates on startup and whenever APK resumes to foreground
  useEffect(() => {
    const bootTimer = window.setTimeout(() => {
      void runAutomaticUpdateCheck(false);
    }, 900);

    let stateHandle: { remove: () => Promise<void> } | null = null;
    let disposed = false;

    if (isNativeApk) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void runAutomaticUpdateCheck(false);
        }
      })
        .then((handle) => {
          if (disposed) void handle.remove();
          else stateHandle = handle;
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      window.clearTimeout(bootTimer);
      if (stateHandle) void stateHandle.remove();
    };
  }, [isNativeApk, runAutomaticUpdateCheck]);

  // Also check admin-forced update settings once user signs in
  useEffect(() => {
    if (!isLoggedIn) return;
    const t = window.setTimeout(() => {
      void runAutomaticUpdateCheck(false);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [isLoggedIn, runAutomaticUpdateCheck]);

  // Keep an accurate in-app navigation stack for Android hardware Back ("triangle") button
  useEffect(() => {
    const fullPath = location.pathname + location.search;
    const stack = routeHistoryRef.current;

    if (navigationType === 'PUSH') {
      if (stack[stack.length - 1] !== fullPath) {
        stack.push(fullPath);
        if (stack.length > 30) stack.shift();
      }
    } else if (navigationType === 'REPLACE') {
      if (stack.length > 0) {
        stack[stack.length - 1] = fullPath;
      } else {
        stack.push(fullPath);
      }
    } else if (navigationType === 'POP') {
      if (stack.length > 1 && stack[stack.length - 2] === fullPath) {
        stack.pop();
      } else if (stack[stack.length - 1] !== fullPath) {
        const existingIdx = stack.lastIndexOf(fullPath);
        if (existingIdx !== -1) {
          routeHistoryRef.current = stack.slice(0, existingIdx + 1);
        } else {
          routeHistoryRef.current = [fullPath];
        }
      }
    }
  }, [location.pathname, location.search, navigationType]);

  // Android Hardware / Navigation-bar Triangle Back Button handler (Capacitor APK)
  useEffect(() => {
    if (!isNativeApk) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let disposed = false;

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // 1. Dismiss splash if still showing
      if (showWelcomeSplashRef.current) {
        dismissWelcomeSplashRef.current();
        return;
      }

      // 2. Close any open modal/drawer first without navigating away
      if (closeTopOpenModal()) {
        return;
      }

      const currentPath = pathnameRef.current;
      const loggedIn = isLoggedInRef.current;
      const isRootRoute = loggedIn
        ? currentPath === '/home' || currentPath === '/'
        : currentPath === '/login' || currentPath === '/' || currentPath === '/download';

      // 3. On any inner page: go back 1 page (or fall back to the Home/first page instead of exiting)
      if (!isRootRoute) {
        const hasPrevInApp = routeHistoryRef.current.length > 1;
        const hasRouterIdx = typeof window.history.state?.idx === 'number' && window.history.state.idx > 0;
        if (hasPrevInApp || hasRouterIdx || canGoBack) {
          navigateRef.current(-1);
        } else {
          navigateRef.current(loggedIn ? '/home' : '/login', { replace: true });
        }
        return;
      }

      // 4. On the first page (/home or /login): never exit on a single accidental tap
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        setExitToastVisible(false);
        void CapacitorApp.exitApp();
      } else {
        lastBackPressRef.current = now;
        setExitToastVisible(true);
        if (exitToastTimerRef.current) {
          window.clearTimeout(exitToastTimerRef.current);
        }
        exitToastTimerRef.current = window.setTimeout(() => {
          setExitToastVisible(false);
          exitToastTimerRef.current = null;
        }, 2000);
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listenerHandle = handle;
      }
    }).catch(() => {});

    return () => {
      disposed = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
      if (exitToastTimerRef.current) {
        window.clearTimeout(exitToastTimerRef.current);
        exitToastTimerRef.current = null;
      }
    };
  }, [isNativeApk]);

  // Preserve ?ref=... across navigation and initial boot
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refParam = (params.get('ref') || '').trim();
    if (refParam) {
      try {
        localStorage.setItem('fxarena_pending_ref', refParam);
      } catch {
        // ignore
      }
    }
  }, [location.search]);

  useEffect(() => {
    if (!showWelcomeSplash) return;
    const preloadImg = new Image();
    preloadImg.src = WELCOME_SPLASH_URL;
    splashTimerRef.current = window.setTimeout(() => {
      setShowWelcomeSplash(false);
      splashTimerRef.current = null;
    }, 1200);
    return () => {
      if (splashTimerRef.current) {
        window.clearTimeout(splashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;
    let unsubscribeRegistrations: (() => void) | null = null;

    const seedDatabase = async (email: string, uid: string) => {
      if (!isAuthorizedAdmin({ email, uid })) return;
      if (getFirestoreHealth() !== 'operational') return;
      const SEED_FLAG = 'fxarena_db_seeded_v2';
      try {
        if (localStorage.getItem(SEED_FLAG) === '1') return;
      } catch {
        // ignore storage restrictions
      }
      try {
        const gamesSnap = await getDocs(collection(db, 'games'));
        if (gamesSnap.empty) {
          const batch = writeBatch(db);
          GAMES.forEach(game => {
            batch.set(doc(db, 'games', game.id), game);
          });
          await batch.commit();
        } else {
          const repairGamesBatch = writeBatch(db);
          let hasDeadGameImg = false;
          gamesSnap.docs.forEach((docSnap) => {
            const d = docSnap.data();
            const img = String(d?.image || '').toLowerCase();
            if (img.includes('i.ibb.co/v4v8q5n')) {
              hasDeadGameImg = true;
              repairGamesBatch.update(docSnap.ref, {
                image: resolveSafeModeImage(d.image, d.title || docSnap.id),
              });
            }
          });
          if (hasDeadGameImg) {
            await repairGamesBatch.commit();
          }
        }

        const rulesSnap = await getDocs(collection(db, 'gameRules'));
        if (rulesSnap.empty) {
          const batch = writeBatch(db);
          const defaultRules = [
            {
              id: 'battle_royale',
              type: 'Battle Royale',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Using banned apps will lead to ban.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'clash_squad',
              type: 'Clash Squad',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Teaming with enemies is banned.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'lone_wolf',
              type: 'Lone Wolf',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Rank pushing is not allowed.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            }
          ];
          defaultRules.forEach(rule => {
            batch.set(doc(db, 'gameRules', rule.id), rule);
          });
          await batch.commit();
        }

        const isInternalOrigin = (u: string) => isBlockedShareUrl(u);
        const rawEnvSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '').trim();
        const envSiteUrl = !isInternalOrigin(rawEnvSiteUrl) ? rawEnvSiteUrl : '';
        const rawEnvApkUrl = (import.meta.env.VITE_APK_DOWNLOAD_URL || '').trim();
        const envApkUrl = !isInternalOrigin(rawEnvApkUrl) ? rawEnvApkUrl : '';
        const safeBaseUrl = envSiteUrl || (!isInternalOrigin(window.location.origin) ? window.location.origin : '');

        const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
        if (!settingsSnap.exists()) {
          await setDoc(doc(db, 'appSettings', 'referral_support'), {
            referral: {
              baseUrl: safeBaseUrl,
              apkDownloadUrl: envApkUrl,
              perReferralReward: 3,
              rewardType: 'bonus',
              depositPercentage: 50,
              bonusPercentage: 50,
              newUserReward: 2
            },
            support: {
              whatsapp: 'https://wa.me/910000000000',
              telegram: 'https://t.me/fxarenaesports',
              email: 'support@fxarenaesports.com'
            }
          });
        } else {
          const existingRef = settingsSnap.data()?.referral;
          if (existingRef) {
            const updates: Record<string, any> = {};
            if (existingRef.perReferralReward === 50) updates.perReferralReward = 3;
            if (existingRef.newUserReward === 10) updates.newUserReward = 2;
            if (existingRef.baseUrl && isInternalOrigin(existingRef.baseUrl)) {
              updates.baseUrl = safeBaseUrl;
            }
            if (existingRef.apkDownloadUrl && isInternalOrigin(existingRef.apkDownloadUrl)) {
              updates.apkDownloadUrl = envApkUrl;
            } else if (!existingRef.apkDownloadUrl && envApkUrl) {
              updates.apkDownloadUrl = envApkUrl;
            }
            if (Object.keys(updates).length > 0) {
              await setDoc(doc(db, 'appSettings', 'referral_support'), {
                referral: {
                  ...existingRef,
                  ...updates
                }
              }, { merge: true });
            }
          }
        }

        const modesSnap = await getDocs(collection(db, 'gameModes'));
        if (modesSnap.empty) {
          const batch = writeBatch(db);
          Object.entries(GAME_MODES_DATA).forEach(([gameId, modes]) => {
            modes.forEach((mode, index) => {
              const modeId = `${gameId}_${mode.id}`;
              batch.set(doc(db, 'gameModes', modeId), {
                ...mode,
                gameId,
                order: index
              });
            });
          });
          await batch.commit();
        } else {
          const repairModesBatch = writeBatch(db);
          let hasDeadModeImg = false;
          modesSnap.docs.forEach((docSnap) => {
            const d = docSnap.data();
            const img = String(d?.image || '').toLowerCase();
            if (img.includes('i.ibb.co/v4v8q5n')) {
              hasDeadModeImg = true;
              repairModesBatch.update(docSnap.ref, {
                image: resolveSafeModeImage(d.image, d.title || d.gameId || docSnap.id),
              });
            }
          });
          if (hasDeadModeImg) {
            await repairModesBatch.commit();
          }
        }

        for (const staffEmail of STAFF_EMAILS) {
          try {
            const staffUsersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', staffEmail)));
            for (const uDoc of staffUsersSnap.docs) {
              await setDoc(doc(db, 'staff', uDoc.id), {
                email: staffEmail,
                role: 'match_staff',
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          } catch {
            // Staff user doc sync skipped when offline/quota-limited
          }
        }

        for (const freeEmail of FREE_MATCH_STAFF_EMAILS) {
          try {
            const freeUsersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', freeEmail)));
            for (const uDoc of freeUsersSnap.docs) {
              await setDoc(doc(db, 'freeMatchStaff', uDoc.id), {
                email: freeEmail,
                role: 'free_match_staff',
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          } catch {
            // Free match staff doc sync skipped when offline/quota-limited
          }
        }

        try {
          localStorage.setItem(SEED_FLAG, '1');
        } catch {
          // ignore
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'seedDatabase');
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }
      if (unsubscribeRegistrations) {
        unsubscribeRegistrations();
        unsubscribeRegistrations = null;
      }

      if (firebaseUser) {
        // Persist authenticated session immediately so ProtectedRoute never bounces back to /login
        setIsLoggedIn(true);
        setLoading(false);
        setUser((prev) => {
          if (prev && prev.id === firebaseUser.uid) return prev;
          return readCachedUser(firebaseUser.uid) || buildBaselineUser(firebaseUser);
        });

        // Redirect logged-in users away from auth/landing root (never redirect off /download)
        if (['/login', '/signup', '/'].includes(pathnameRef.current)) {
          navigate('/home', { replace: true });
        }

        seedDatabase(firebaseUser.email || '', firebaseUser.uid);

        const userDocRef = doc(db, 'users', firebaseUser.uid);

        unsubscribeUser = onSnapshot(userDocRef, async (userDoc) => {
          if (!userDoc.metadata.fromCache) {
            setFirestoreHealth('operational');
          }
          if (userDoc.exists()) {
            const data = userDoc.data() as any;

            if (!data.wallet) {
              try {
                const migratedWallet = {
                  deposit: data.walletBalance || 0,
                  winnings: data.winnings || 0,
                  bonus: data.bonus || 0
                };
                if (data.walletBalance === undefined && data.winnings === undefined && data.bonus === undefined) {
                  Object.assign(migratedWallet, DEFAULT_USER_DATA.wallet);
                }
                const batch = writeBatch(db);
                batch.update(userDocRef, { wallet: migratedWallet });
                await batch.commit();
                return;
              } catch (migErr) {
                handleFirestoreError(migErr, OperationType.UPDATE, `users/${firebaseUser.uid}`);
              }
            }

            const normalizedEmail = (firebaseUser.email || '').toLowerCase();
            const shouldBeAdmin = isAuthorizedAdmin({ email: normalizedEmail, uid: firebaseUser.uid });

            if (
              shouldBeAdmin &&
              !data.isAdmin &&
              (firebaseUser.emailVerified || firebaseUser.uid === 'XoXyXcnrlzOaMIKKolXnU3mT9xn1') &&
              getFirestoreHealth() === 'operational'
            ) {
              try {
                await updateDoc(userDocRef, { isAdmin: true });
                await setDoc(doc(db, 'admins', firebaseUser.uid), {
                  email: normalizedEmail,
                  role: 'super_admin',
                  updatedAt: serverTimestamp()
                }, { merge: true });
              } catch (adminSyncErr) {
                handleFirestoreError(adminSyncErr, OperationType.UPDATE, `admins/${firebaseUser.uid}`);
              }
            }

            const resolvedUser = { id: userDoc.id, ...data, isAdmin: Boolean(shouldBeAdmin) } as User;
            setUser(resolvedUser);
            writeCachedUser(firebaseUser.uid, resolvedUser);
            setIsLoggedIn(true);
            setLoading(false);

            if (data.referredBy && !data.referralClaimed) {
              processReferralReward(data, firebaseUser.uid);
            }
          } else {
            try {
              const normalizedEmail = (firebaseUser.email || '').toLowerCase();
              const isAdmin = isAuthorizedAdmin({ email: normalizedEmail, uid: firebaseUser.uid });
              const pendingRef = (() => {
                try {
                  return localStorage.getItem('fxarena_pending_ref') || null;
                } catch {
                  return null;
                }
              })();
              const newUser: User = {
                username: (firebaseUser.displayName || `Gamer_${firebaseUser.uid.slice(0, 5)}`).slice(0, 100),
                email: (firebaseUser.email || '').slice(0, 200),
                phone: (firebaseUser.phoneNumber || '').slice(0, 30),
                ...DEFAULT_USER_DATA,
                ...(pendingRef ? { referredBy: pendingRef.slice(0, 100), referralClaimed: false } : {}),
                isAdmin: Boolean(isAdmin && firebaseUser.emailVerified)
              };
              await setDoc(userDocRef, {
                ...newUser,
                createdAt: serverTimestamp(),
              });
              if (pendingRef) {
                try {
                  localStorage.removeItem('fxarena_pending_ref');
                } catch {
                  // ignore
                }
              }
              if (isAdmin) {
                await setDoc(doc(db, 'admins', firebaseUser.uid), {
                  email: normalizedEmail,
                  role: 'super_admin',
                  updatedAt: serverTimestamp()
                }, { merge: true }).catch(() => {});
              }
            } catch (createErr) {
              handleFirestoreError(createErr, OperationType.WRITE, `users/${firebaseUser.uid}`);
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          // Keep user logged in with cached/baseline data instead of booting them to /login
          setLoading(false);
        });

        const regQuery = query(collection(db, 'registrations'), where('userId', '==', firebaseUser.uid), limit(50));
        unsubscribeRegistrations = onSnapshot(
          regQuery,
          (regSnap) => {
            const matchIds = regSnap.docs.map(doc => doc.data().tournamentId).filter(Boolean);
            setJoinedMatchIds(matchIds);
          },
          (error) => {
            handleFirestoreError(error, OperationType.LIST, 'registrations');
          }
        );
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setJoinedMatchIds([]);
        const publicPaths = isNativeApk
          ? ['/login', '/signup', '/download']
          : ['/', '/download', '/login', '/signup'];
        if (!publicPaths.includes(pathnameRef.current)) {
          navigate(isNativeApk ? '/login' : '/', { replace: true });
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeRegistrations) unsubscribeRegistrations();
    };
  }, []);

  const handleLogin = React.useCallback(() => {
    const currentFbUser = auth.currentUser;
    if (currentFbUser) {
      setIsLoggedIn(true);
      setLoading(false);
      setUser((prev) => {
        if (prev && prev.id === currentFbUser.uid) return prev;
        return readCachedUser(currentFbUser.uid) || buildBaselineUser(currentFbUser);
      });
    }
    navigate('/home', { replace: true });
  }, [navigate]);

  const handleLogout = async () => {
    const uid = auth.currentUser?.uid;
    clearCachedUser(uid);
    setIsLoggedIn(false);
    setUser(null);
    setJoinedMatchIds([]);
    await auth.signOut();
    navigate('/login', { replace: true });
  };

  const handlePageChange = React.useCallback((page: Page, id?: string) => {
    let path = pageToPath[page];
    if (id) {
      if (page === Page.TOURNAMENTS) path = id.startsWith('?') ? `${path}${id}` : `${path}/${id}`;
      else if (page === Page.JOIN_MATCH) path = `${path}/${id}`;
      else if (page === Page.MATCH_DETAILS) path = `${path}/${id}`;
      else if (page === Page.ADMIN_USER_PROFILE) path = `${path}/${id}`;
      else if (page === Page.ADMIN_EDIT_MATCH) path = `${path}/${id}`;
      else if (page === Page.ADMIN_CREATE_MATCH) path = id.startsWith('?') ? `${path}${id}` : `${path}/${id}`;
      else if (page === Page.GAME_MODES) path = `${path}/${id}`;
    }
    navigate(path);
  }, [navigate]);

  const handleJoinSuccess = (matchId: string) => {
    setJoinedMatchIds(prev => (prev.includes(matchId) ? prev : [...prev, matchId]));
  };

  const processReferralReward = async (currentUser: any, uid: string) => {
    if (!currentUser.referredBy || currentUser.referralClaimed) return;

    try {
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
      if (!settingsSnap.exists()) return;
      const settings = settingsSnap.data();
      const refSettings = settings.referral;
      if (!refSettings) return;

      const q = query(collection(db, 'users'), where('username', '==', currentUser.referredBy));
      const referrerSnap = await getDocs(q);
      if (referrerSnap.empty) {
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
        return;
      }

      const qDevice = query(collection(db, 'users'), where('deviceId', '==', currentUser.deviceId || 'unknown'));
      const deviceSnap = await getDocs(qDevice);
      if (deviceSnap.docs.some((d) => d.id !== uid && d.data()?.referralClaimed === true)) {
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
        return;
      }

      const referrerDoc = referrerSnap.docs[0];
      const referrerId = referrerDoc.id;

      const rawNewUserReward = refSettings.newUserReward ?? 2;
      const newUserReward = Math.min(10, rawNewUserReward === 10 ? 2 : rawNewUserReward);
      const userBatch = writeBatch(db);
      if (newUserReward > 0) {
        userBatch.update(doc(db, 'users', uid), {
          'wallet.bonus': increment(newUserReward),
          referralClaimed: true
        });
        userBatch.set(doc(collection(db, 'transactions')), {
          userId: uid,
          type: 'bonus',
          amount: newUserReward,
          status: 'completed',
          title: `Referral Bonus (from ${currentUser.referredBy})`.slice(0, 200),
          createdAt: serverTimestamp()
        });
      } else {
        userBatch.update(doc(db, 'users', uid), { referralClaimed: true });
      }
      await userBatch.commit();

      const rawRefReward = refSettings.perReferralReward ?? 3;
      const refReward = rawRefReward === 50 ? 3 : rawRefReward;
      if (refReward > 0 && referrerId !== uid) {
        try {
          const referrerUpdate: any = {};
          if (refSettings.rewardType === 'deposit') {
            referrerUpdate['wallet.deposit'] = increment(refReward);
          } else if (refSettings.rewardType === 'bonus') {
            referrerUpdate['wallet.bonus'] = increment(refReward);
          } else if (refSettings.rewardType === 'both') {
            const depPercentage = refSettings.depositPercentage || 50;
            const depAmount = (refReward * depPercentage) / 100;
            const bonusAmount = refReward - depAmount;
            referrerUpdate['wallet.deposit'] = increment(depAmount);
            referrerUpdate['wallet.bonus'] = increment(bonusAmount);
          }
          const refBatch = writeBatch(db);
          refBatch.update(doc(db, 'users', referrerId), referrerUpdate);
          refBatch.set(doc(collection(db, 'transactions')), {
            userId: referrerId,
            type: 'bonus',
            amount: refReward,
            status: 'completed',
            title: `Referral Reward: ${currentUser.username}`.slice(0, 200),
            createdAt: serverTimestamp()
          });
          await refBatch.commit();
        } catch {
          // Cross-user wallet writes require server/admin execution under strict owner rules
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  };

  const renderWelcomeSplash = () => (
    <AnimatePresence>
      {showWelcomeSplash && !isPublicInstantPath && (
        <motion.div
          key={`welcome-splash-${splashRunId}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={dismissWelcomeSplash}
          className="fixed inset-0 z-[200] bg-[#050508] flex items-center justify-center overflow-hidden select-none cursor-pointer"
        >
          <div className="relative w-full max-w-lg h-full flex items-center justify-center">
            <img
              src={WELCOME_SPLASH_URL}
              alt="Welcome to FX Arena"
              className="w-full h-full object-contain"
            />
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.2, ease: 'linear' }}
              style={{ transformOrigin: 'left' }}
              className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-amber-400"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Allow public download/login/signup routes to render instantly without waiting for Auth initializing
  const shouldShowInitLoader =
    loading &&
    !isPublicInstantPath &&
    !(location.pathname === '/' && !isNativeApk);

  const currentPath = location.pathname;
  let currentPage = Page.HOME;
  for (const [path, page] of Object.entries(pathToPage)) {
    if (currentPath.startsWith(path)) {
      currentPage = page;
      break;
    }
  }

  const showChrome = isLoggedIn && !['/login', '/signup', '/download'].includes(location.pathname);
  const showHeader = showChrome && !['/home', '/tournaments', '/match/', '/match-details/', '/wallet/add', '/wallet/withdraw', '/admin', '/referral', '/profile/details', '/profile/stats', '/game-modes', '/profile'].some(p => location.pathname.startsWith(p));
  const showNav = showChrome && !['/match/', '/match-details/', '/admin/match/'].some(p => location.pathname.startsWith(p));

  const renderMainContent = () => {
    if (shouldShowInitLoader) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-neutral-500">Loading FX Arena...</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background relative selection:bg-primary/20">
        <ScrollToTop />
        <GlobalNotificationListener
          user={user}
          joinedMatchIds={joinedMatchIds}
          onPageChange={handlePageChange}
        />
        {showHeader && user && <Header user={user} onPageChange={handlePageChange} />}

        <main className="mx-auto max-w-lg min-h-screen bg-background overflow-x-hidden">
          <Suspense
            fallback={
              <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <Routes location={location}>
            <Route
              path="/"
              element={
                isLoggedIn ? (
                  <Navigate to="/home" replace />
                ) : isNativeApk ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DownloadApp isLoggedIn={false} />
                )
              }
            />
            <Route path="/download" element={<DownloadApp isLoggedIn={isLoggedIn} />} />
            <Route
              path="/login"
              element={isLoggedIn ? <Navigate to="/home" replace /> : <Auth onLogin={handleLogin} />}
            />
            <Route
              path="/signup"
              element={isLoggedIn ? <Navigate to="/home" replace /> : <Auth onLogin={handleLogin} />}
            />

            <Route path="/home" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <Home user={user} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
              </ProtectedRoute>
            } />

            <Route path="/game-modes/:gameId" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <GameModes onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/tournaments" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
              </ProtectedRoute>
            } />

            <Route path="/tournaments/:gameId" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
              </ProtectedRoute>
            } />

            <Route path="/match-details/:id" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <MatchDetails
                  user={user!}
                  onPageChange={handlePageChange}
                  joinedMatchIds={joinedMatchIds}
                />
              </ProtectedRoute>
            } />

            <Route path="/match/:id" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <JoinMatch
                  user={user!}
                  onPageChange={handlePageChange}
                  joinedMatchIds={joinedMatchIds}
                  onJoinSuccess={handleJoinSuccess}
                />
              </ProtectedRoute>
            } />

            <Route path="/wallet" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <WalletPage user={user} onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/wallet/add" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AddMoney onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/wallet/withdraw" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <Withdraw user={user} onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/profile" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <ProfilePage user={user!} onPageChange={handlePageChange} onLogout={handleLogout} />
              </ProtectedRoute>
            } />

            <Route path="/profile/details" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <ProfileDetails user={user!} onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/profile/stats" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <GameStats user={user!} onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/referral" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <ReferralPage user={user!} onPageChange={handlePageChange} />
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <StaffOrAdminRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AdminPage onPageChange={handlePageChange} />
              </StaffOrAdminRoute>
            } />

            <Route path="/admin/user/:id" element={
              <AdminRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AdminUserDetail onPageChange={handlePageChange} />
              </AdminRoute>
            } />

            <Route path="/admin/match/edit/:id" element={
              <StaffOrAdminRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AdminEditMatch onPageChange={handlePageChange} />
              </StaffOrAdminRoute>
            } />

            <Route path="/admin/match/create" element={
              <StaffOrAdminRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AdminCreateMatch onPageChange={handlePageChange} />
              </StaffOrAdminRoute>
            } />

            <Route path="/admin/match/create/:duplicateId" element={
              <StaffOrAdminRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AdminCreateMatch onPageChange={handlePageChange} />
              </StaffOrAdminRoute>
            } />

            <Route path="/admin/modes" element={
              <AdminRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <AdminModes onPageChange={handlePageChange} />
              </AdminRoute>
            } />

            <Route path="/leaderboard" element={
              <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} user={user}>
                <Leaderboard />
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to={isLoggedIn ? "/home" : (isNativeApk ? "/login" : "/")} replace />} />
            </Routes>
          </Suspense>
        </main>

        {showNav && (
          <BottomNav
            currentPage={currentPage}
            onPageChange={handlePageChange}
            user={user}
          />
        )}

        {/* Global Background Glow */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-full pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-20%] w-[80%] h-[40%] bg-secondary/10 blur-[120px] rounded-full" />
        </div>
      </div>
    );
  };

  return (
    <>
      {renderMainContent()}
      {renderWelcomeSplash()}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        updateInfo={appUpdateInfo}
        isRechecking={isCheckingUpdate}
        onRecheck={() => void runAutomaticUpdateCheck(true)}
        onDismiss={() => {
          if (appUpdateInfo && !appUpdateInfo.forceUpdate) {
            dismissedUpdateKeyRef.current = `${appUpdateInfo.latestVersion}_${appUpdateInfo.latestBuildNumber}_${appUpdateInfo.source}`;
            setIsUpdateModalOpen(false);
          }
        }}
      />
      <AnimatePresence>
        {exitToastVisible && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[180] px-4 py-2.5 rounded-2xl bg-neutral-900/95 border border-white/10 text-white text-[11px] font-bold tracking-wide shadow-2xl whitespace-nowrap pointer-events-none"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
