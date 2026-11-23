import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Shield, Users, Trophy, DollarSign, Settings, 
  Search, Ban, Unlock, Wallet, Plus, Minus, Trash2, 
  Clock, Map as MapIcon, Users as UsersIcon, LogOut,
  CheckCircle2, AlertCircle, Loader2, Save, RefreshCw,
  Edit2, Copy, Upload, Gamepad2, Key, Check, CheckCheck,
  ListChecks, FileText, Sparkles, PlusCircle, RotateCcw,
  Filter, ChevronUp, ChevronDown, Send, Bell, QrCode, XCircle
} from 'lucide-react';
import { Page, User, Tournament, Banner, PaymentGateway } from '../types';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatMatchTime } from '../utils/dateUtils';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import AdminNotificationsTab from '../components/AdminNotificationsTab';
import { isAuthorizedAdmin, isStaffUser, hasControlPanelAccess, STAFF_EMAILS } from '../utils/adminAuth';
import { isBlockedShareUrl } from '../utils/shareLinks';

import { 
  collection, doc, onSnapshot, updateDoc, deleteDoc,
  addDoc, serverTimestamp, runTransaction, writeBatch,
  query, where, orderBy, getDocs, getDoc, increment, setDoc
} from 'firebase/firestore';
import { sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface AdminPageProps {
  onPageChange: (page: Page, id?: string) => void;
}

enum AdminTab {
  DASHBOARD = 'dashboard',
  NOTIFICATIONS = 'notifications',
  USERS = 'users',
  MATCHES = 'matches',
  TRANSACTIONS = 'transactions',
  RULES = 'rules',
  REFERRAL = 'referral',
  BANNERS = 'banners',
  MODES = 'modes',
  PAYMENT = 'payment'
}

// Built-in rule presets for various game modes and sections
const RULE_PRESETS: Record<string, { title: string; category: string; rules: string[] }> = {
  battle_royale: {
    title: 'Battle Royale',
    category: 'Battle Royale',
    rules: [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: Strictly mobile & tablet devices only. Emulators/PC are 100% prohibited.',
      'Registration Name: Enter exact in-game IGN without font errors or unsupported special characters.',
      'Anti-Teaming Rule: Teaming with opponents is strictly prohibited and results in permanent ban.',
      'Hacking & Scripts: Zero-tolerance policy for aimbots, auto-headshots, speed hacks, or modified game files.',
      'Late Entry: Room closes 2 minutes before match start time. Late entry is not entertained.',
      'Screenshot Policy: In case of ranking/kill dispute, high-definition final match screenshot is mandatory.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by admin, 100% of entry fee is refunded back to wallet instantly.'
    ]
  },
  clash_squad: {
    title: 'Clash Squad (4v4 / Duo)',
    category: 'Clash Squad',
    rules: [
      'Level Requirement: Minimum Level 40 in Free Fire account.',
      'Headshot Rate: Clash Squad headshot rate must remain below 70%.',
      'Device Requirements: Mobile & Tablet only. Emulators will be immediately kicked and banned.',
      'Gun Attributes: Gun attributes and character skill settings will be as per custom room setup.',
      'Grenades & Items: Usage of limited tactical items will follow room preset rules.',
      'Teaming & Sabotage: Teaming or intentional feeding is strictly forbidden.',
      'Screenshot Policy: Winning team captain must submit end-game score screenshot in case of dispute.',
      'Prize Distribution: Winnings will be credited automatically to winning player/team wallets post verification.',
      'Admin Decision: Admin ruling will be final and binding for all participants.'
    ]
  },
  lone_wolf: {
    title: 'Lone Wolf (1v1 / 2v2)',
    category: 'Lone Wolf',
    rules: [
      'Level Requirement: Level 30+ Free Fire profile.',
      'Headshot Rate: Lone Wolf headshot rate maximum 75%.',
      'Device Requirements: Mobile / Tablet players only. No PC / Emulators.',
      'Fair Duel: One-on-one duel requires true sportsman spirit without glitch exploiting.',
      'Weapon Restrictions: Respect custom weapon restrictions if specified in room title (e.g. M1887 only, Sniper only).',
      'Disconnect Policy: If a player disconnects mid-round, rematch will only be granted if admin verifies technical glitch.',
      'Screenshot Requirement: Final victory screen screenshot mandatory for dispute settlement.',
      'Instant Payout: Winnings credited within 10-15 minutes after match confirmation.'
    ]
  },
  custom_room: {
    title: 'Custom Room / Tournament',
    category: 'Custom Room',
    rules: [
      'All standard esports tournament fairplay rules apply.',
      'Slot Assignment: Players must join ONLY their assigned slot number. Wrong slot leads to kick without refund.',
      'Room Settings: Custom room parameters (Ammo, Fall Damage, Character Skills) are set as specified in match title.',
      'No third-party crosshairs, config files, or GFX tools allowed.',
      'Admin decision is final in all dispute settlements.'
    ]
  },
  sniper_only: {
    title: 'Sniper Only Challenge',
    category: 'Sniper Only',
    rules: [
      'Only Sniper Rifles (AWM, Kar98k, M82B, Barrett) are permitted for combat.',
      'Using pistols, melee, or AR/SMG weapons will result in immediate disqualification with 0 points.',
      'No emulator or modified script allowed.',
      'Final kill feed and damage screenshot must be submitted.'
    ]
  },
  four_v_four: {
    title: '4v4 Clash Duel',
    category: '4v4 Clash',
    rules: [
      'Full squad (4 players) must be ready before room launch time.',
      'All 4 players must have registered with valid IGNs.',
      'No roof camping or out-of-bounds wall glitching.',
      'First team to win the required round count wins the contest.'
    ]
  },
  one_v_one: {
    title: '1v1 Duel Arena',
    category: '1v1 Duel',
    rules: [
      'Pure 1v1 head-to-head showdown on chosen map.',
      'Gun selection rules as specified in room rules (e.g. Desert Eagle only or Shotgun only).',
      'No wall-trapping or infinite gloo wall glitch.',
      'Proof screenshot required for claiming bounty prize.'
    ]
  }
};

export default function AdminPage({ onPageChange }: AdminPageProps) {
  const isFullAdmin = isAuthorizedAdmin(auth.currentUser);
  const isStaffRole = isStaffUser(auth.currentUser);
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    isStaffUser(auth.currentUser) ? AdminTab.MATCHES : AdminTab.DASHBOARD
  );
  const [users, setUsers] = useState<User[]>([]);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<{ isOpen: boolean, matchId: string }>({ isOpen: false, matchId: '' });
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] = useState<Tournament | null>(null);
  const [playerWinningCoins, setPlayerWinningCoins] = useState<Record<string, string>>({}); // direct custom coins entered by admin
  const [playerResults, setPlayerResults] = useState<Record<string, number>>({}); // optional kills or rank
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({}); // optional position rank
  const [matchCredentialsMap, setMatchCredentialsMap] = useState<Record<string, { roomId?: string; roomPassword?: string; roomNotes?: string }>>({});
  const [needsAdminVerification, setNeedsAdminVerification] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Dynamic Rules State for All Game Mode Sections
  const [gameRulesDocs, setGameRulesDocs] = useState<Record<string, { id: string; title: string; category?: string; section?: string; rules: string[]; updatedAt?: any }>>({});
  const [gameModesList, setGameModesList] = useState<any[]>([]);
  const [activeRuleTab, setActiveRuleTab] = useState<string>('battle_royale');
  const [activeSectionTitle, setActiveSectionTitle] = useState<string>('Battle Royale');
  const [activeSectionCategory, setActiveSectionCategory] = useState<string>('Battle Royale');
  const [ruleText, setRuleText] = useState('');
  const [ruleList, setRuleList] = useState<string[]>([]);
  const [ruleEditMode, setRuleEditMode] = useState<'interactive' | 'raw'>('interactive');
  const [newSingleRuleText, setNewSingleRuleText] = useState('');
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [newSectionForm, setNewSectionForm] = useState({ title: '', category: '', template: 'battle_royale' });

  // Room ID & Password Declaration State
  const [isDeclareRoomModalOpen, setIsDeclareRoomModalOpen] = useState(false);
  const [selectedDeclareRoomMatch, setSelectedDeclareRoomMatch] = useState<Tournament | null>(null);
  const [declareRoomForm, setDeclareRoomForm] = useState({
    roomId: '',
    roomPassword: '',
    setStatusLive: true,
    customNotes: '',
    sendNotificationOnRoomDeclare: true
  });
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'need_room' | 'room_ready' | 'live' | 'completed'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<any>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [bannerType, setBannerType] = useState<Banner['type']>('main');
  const [bannerOrder, setBannerOrder] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [gatewayForm, setGatewayForm] = useState({
    id: '',
    name: '',
    apiKey: '',
    secretKey: '',
    merchantId: '',
    webhookSecret: '',
    upiId: '',
    isProduction: false
  });
  const [qrForm, setQrForm] = useState({
    qrImageUrl: '',
    amountQrs: {} as Record<string, string>,
    upiId: '',
    merchantName: 'FX Arena eSport',
    isActive: true
  });
  const [selectedQrAmountKey, setSelectedQrAmountKey] = useState<string>('default');
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrUploadProgress, setQrUploadProgress] = useState(0);
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal back handlers
  useModalBackHandler(isDeleteConfirmOpen.isOpen, () => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' }));
  useModalBackHandler(isResultModalOpen, () => setIsResultModalOpen(false));
  useModalBackHandler(isBannerModalOpen, () => setIsBannerModalOpen(false));
  useModalBackHandler(isDeclareRoomModalOpen, () => setIsDeclareRoomModalOpen(false));
  useModalBackHandler(isAddSectionModalOpen, () => setIsAddSectionModalOpen(false));
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const qrFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("File picked for banner upload:", file.name);
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      const downloadURL = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      console.log("Uploaded successfully:", downloadURL.slice(0, 80));
      setImageUrl(downloadURL);
      setUploadProgress(100);
    } catch (error: any) {
      console.error('Upload Process Error:', error);
      alert(error?.message || 'Gallery upload failed, please try another image.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Real-time listeners
  useEffect(() => {
    const currentUser = auth.currentUser;
    const uid = currentUser?.uid;
    const isFull = isAuthorizedAdmin(currentUser);
    const isStaff = isStaffUser(currentUser);

    if (!hasControlPanelAccess(currentUser)) {
      onPageChange(Page.HOME);
      return;
    }

    if (isStaff) {
      setActiveTab((prev) =>
        prev === AdminTab.MATCHES || prev === AdminTab.NOTIFICATIONS ? prev : AdminTab.MATCHES
      );
    }

    // Check if admin/staff needs email verification for Firestore rule writes
    const checkAdminWriteStatus = async () => {
      try {
        if (uid === 'XoXyXcnrlzOaMIKKolXnU3mT9xn1' || currentUser?.emailVerified) {
          setNeedsAdminVerification(false);
          return;
        }
        if (isStaff && uid) {
          const staffDoc = await getDoc(doc(db, 'staff', uid));
          setNeedsAdminVerification(!staffDoc.exists());
          return;
        }
        if (uid) {
          const adminDoc = await getDoc(doc(db, 'admins', uid));
          setNeedsAdminVerification(!adminDoc.exists());
        }
      } catch {
        setNeedsAdminVerification(!currentUser?.emailVerified && uid !== 'XoXyXcnrlzOaMIKKolXnU3mT9xn1');
      }
    };
    checkAdminWriteStatus();

    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'))
    );

    unsubs.push(
      onSnapshot(collection(db, 'matches'), (snapshot) => {
        setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'))
    );

    unsubs.push(
      onSnapshot(collection(db, 'matchCredentials'), (snapshot) => {
        const credMap: Record<string, { roomId?: string; roomPassword?: string; roomNotes?: string }> = {};
        snapshot.docs.forEach((docSnap) => {
          const d = docSnap.data();
          credMap[docSnap.id] = {
            roomId: d.roomId || '',
            roomPassword: d.roomPassword || '',
            roomNotes: d.roomNotes || '',
          };
        });
        setMatchCredentialsMap(credMap);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'matchCredentials'))
    );

    if (isFull) {
      unsubs.push(
        onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc')), (snapshot) => {
          setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'))
      );

      unsubs.push(
        onSnapshot(collection(db, 'gameRules'), (snapshot) => {
          const docsMap: Record<string, any> = {};
          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            docsMap[docSnap.id] = {
              id: docSnap.id,
              title: data.title || data.section || data.type || docSnap.id.replace(/_/g, ' '),
              category: data.category || data.title || 'General',
              section: data.section || data.title || docSnap.id,
              rules: data.rules || [],
              updatedAt: data.updatedAt
            };
          });
          setGameRulesDocs(docsMap);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'gameRules'))
      );

      unsubs.push(
        onSnapshot(collection(db, 'gameModes'), (snapshot) => {
          setGameModesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'gameModes'))
      );

      unsubs.push(
        onSnapshot(doc(db, 'appSettings', 'referral_support'), (snapshot) => {
          if (snapshot.exists()) {
            setAppSettings(snapshot.data());
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, 'appSettings/referral_support'))
      );

      unsubs.push(
        onSnapshot(query(collection(db, 'banners'), orderBy('order', 'asc')), (snapshot) => {
          setBanners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'banners'))
      );

      unsubs.push(
        onSnapshot(collection(db, 'paymentSettings'), (snapshot) => {
          setPaymentGateways(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentGateway)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'paymentSettings'))
      );

      unsubs.push(
        onSnapshot(doc(db, 'appSettings', 'payment_qr'), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const cfg = data.paymentQr || data;
            setQrForm({
              qrImageUrl: cfg.qrImageUrl || '',
              amountQrs: (cfg.amountQrs && typeof cfg.amountQrs === 'object') ? cfg.amountQrs : {},
              upiId: cfg.upiId || '',
              merchantName: cfg.merchantName || 'FX Arena eSport',
              isActive: cfg.isActive !== false
            });
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, 'appSettings/payment_qr'))
      );
    }

    setLoading(false);
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [onPageChange]);

  // Dashboard Stats
  const totalUsers = users.length;
  const totalMatches = matches.length;
  const totalJoinedPlayers = matches.reduce((acc, m) => acc + (m.playersCount || 0), 0);
  const pendingTransactionsCount = transactions.filter(t => String(t.status || '').toLowerCase().trim() === 'pending').length;
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit' && (t.status === 'completed' || !t.status))
    .reduce((acc, t) => acc + (t.amount || 0), 0);
  const totalWithdrawals = transactions
    .filter(t => (t.type === 'withdrawal' || t.type === 'withdraw') && (t.status === 'completed' || !t.status))
    .reduce((acc, t) => acc + (t.amount || 0), 0);

  // User Actions
  const handleBanUser = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isBanned: !currentStatus });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleUpdateBalance = async (userId: string, amount: number, type: 'deposit' | 'withdrawal') => {
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found');
        
        const userData = userSnap.data() as User;
        const currentDeposit = userData.wallet?.deposit || 0;
        
        if (type === 'withdrawal' && currentDeposit < amount) {
          throw new Error('Insufficient deposit balance');
        }

        const newDeposit = type === 'deposit' ? currentDeposit + amount : currentDeposit - amount;
        
        transaction.update(userRef, { "wallet.deposit": newDeposit });
        
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId,
          type,
          amount,
          status: 'completed',
          title: `Admin ${type}`,
          createdAt: serverTimestamp()
        });
      });
      alert(`Balance ${type}ed successfully`);
    } catch (e: any) {
      alert(e.message || 'Update failed');
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Password reset email sent to ${email}`);
    } catch (e) {
      alert('Failed to send reset email');
      console.error(e);
    }
  };


  const processDeleteMatch = async () => {
    const { matchId } = isDeleteConfirmOpen;

    if (!matchId || typeof matchId !== "string") {
      console.error("Invalid matchId provided for deletion:", matchId);
      return;
    }

    setIsProcessing(true);
    try {
      console.log("Deleting matchId:", matchId);

      await runTransaction(db, async (tx) => {
        const matchRef = doc(db, "matches", matchId);
        const matchSnap = await tx.get(matchRef);
        
        if (!matchSnap.exists()) {
           console.warn("Match document does not exist:", matchId);
           return; 
        }

        const matchData = matchSnap.data() as Tournament;
        const players = matchData.players || [];
        const entryFee = Number(matchData.entryFee || 0);

        console.log("Match Data fetched for delete:", {
          matchId,
          players,
          entryFee,
          status: matchData.status
        });

        // 1. Process Refunds - Only if NOT completed
        if (matchData.status !== 'completed' && players.length > 0 && entryFee > 0) {
          console.log(`Processing refunds for ${players.length} players...`, players);
          for (const player of players) {
            if (!player.userId || typeof player.userId !== 'string') continue;
            
            const userRef = doc(db, "users", player.userId);
            
            // Refund entry fee using increment to wallet.deposit
            tx.update(userRef, { 
              "wallet.deposit": increment(entryFee)
            });

            // Record refund transaction
            const transCol = collection(db, "transactions");
            const newTransRef = doc(transCol);
            tx.set(newTransRef, {
              userId: player.userId,
              type: 'refund',
              amount: entryFee,
              matchId,
              status: 'completed',
              title: `REFUND: ${matchData.displayId || '#000'}`,
              createdAt: serverTimestamp()
            });
          }
        } else {
          console.log("Skipping refunds (Match completed or no players/fee)");
        }

        // 2. Delete Match
        tx.delete(matchRef);
      });

      setIsDeleteConfirmOpen({ isOpen: false, matchId: '' });
      alert('Match deleted successfully and players refunded (if applicable)');
    } catch (e) {
      console.error("Error during match deletion:", e);
      handleFirestoreError(e, OperationType.DELETE, `matches/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclareResult = (match: Tournament) => {
    setSelectedMatchResults(match);
    setPlayerWinningCoins({});
    setPlayerResults({});
    setPlayerPositionResults({});
    setIsResultModalOpen(true);
  };

  const handleEditMatch = (m: Tournament) => {
    console.log("Navigating to edit match:", m.id);
    if (!m.id) {
      console.error("Match ID is missing!");
      return;
    }
    onPageChange(Page.ADMIN_EDIT_MATCH, m.id);
  };

  const handleDuplicateMatch = async (m: Tournament) => {
    console.log("Navigating to duplicate match:", m.id);
    if (!m.id) {
       console.error("Duplicate failed: Match object or ID missing");
       alert("Cannot duplicate: Match data missing");
       return;
    }
    onPageChange(Page.ADMIN_CREATE_MATCH, m.id);
  };

  const handleSubmitResult = async () => {
    if (!selectedMatchResults || !selectedMatchResults.id) {
       console.error("No valid match selected for results declaration");
       return;
    }

    setIsProcessing(true);

    try {
      await runTransaction(db, async (tx) => {
        const matchId = selectedMatchResults.id!;
        const players = selectedMatchResults.players || [];

        // 1. Collect all unique User References and Snapshots (READS)
        const userSnapMap = new Map<string, { ref: any; snap: any }>();
        for (const player of players) {
          const userId = player.userId;
          if (!userId || typeof userId !== 'string' || userSnapMap.has(userId)) continue;
          const userRef = doc(db, 'users', userId);
          const snap = await tx.get(userRef);
          userSnapMap.set(userId, { ref: userRef, snap });
        }

        // 2. Aggregate payouts and stats per user (handles multi-slot joins cleanly)
        const perUserTotals = new Map<string, { winningAmount: number; kills: number; wonMatch: boolean }>();
        const resultsArray = players.map(player => {
          const playerKey = `${player.userId}_${player.slot}`;
          const rawCoins = Number(playerWinningCoins[playerKey] ?? 0);
          const winningAmount = Number.isFinite(rawCoins) && rawCoins > 0 ? Math.round(rawCoins * 100) / 100 : 0;
          const killsOrRank = Number(playerResults[playerKey] || 0) || 0;
          const posRank = Number(playerPositionResults[playerKey] || 0) || 0;

          if (player.userId && typeof player.userId === 'string') {
            const prev = perUserTotals.get(player.userId) || { winningAmount: 0, kills: 0, wonMatch: false };
            perUserTotals.set(player.userId, {
              winningAmount: Math.round((prev.winningAmount + winningAmount) * 100) / 100,
              kills: prev.kills + (selectedMatchResults.prizeType === 'perKill' ? killsOrRank : 0),
              wonMatch: prev.wonMatch || winningAmount > 0,
            });
          }

          return {
            userId: player.userId,
            slot: player.slot,
            username: player.username,
            ign: player.ign,
            rankOrKills: posRank > 0 ? posRank : killsOrRank,
            positionRank: posRank > 0 ? posRank : null,
            winningAmount,
          };
        });

        // 3. Apply wallet & stat updates (WRITES)
        for (const [userId, totalInfo] of perUserTotals.entries()) {
          const entry = userSnapMap.get(userId);
          if (!entry || !entry.snap.exists()) continue;
          const uData = entry.snap.data() as any;

          const updates: any = {
            'stats.matchesPlayed': increment(1),
          };

          if (totalInfo.wonMatch) {
            updates['stats.totalWins'] = increment(1);
          }

          if (totalInfo.kills > 0) {
            updates['stats.totalKills'] = increment(totalInfo.kills);
          }

          if (totalInfo.winningAmount > 0) {
            if (!uData?.wallet) {
              updates.wallet = {
                deposit: Number(uData?.walletBalance || 0),
                winnings: Math.round(((Number(uData?.winnings || 0)) + totalInfo.winningAmount) * 100) / 100,
                bonus: Number(uData?.bonus || 0),
              };
            } else {
              updates['wallet.winnings'] = increment(totalInfo.winningAmount);
            }
            updates['stats.totalWinnings'] = increment(totalInfo.winningAmount);

            const transRef = doc(collection(db, 'transactions'));
            tx.set(transRef, {
              userId,
              type: 'win',
              amount: totalInfo.winningAmount,
              matchId: matchId,
              status: 'completed',
              title: `WON IN MATCH: ${selectedMatchResults.displayId || selectedMatchResults.title || '#000'}`.slice(0, 200),
              createdAt: serverTimestamp(),
            });
          }

          tx.update(entry.ref, updates);
        }

        const resultsRef = doc(db, 'matchResults', matchId);
        tx.set(resultsRef, {
          matchId,
          matchTitle: selectedMatchResults.title,
          section: selectedMatchResults.section,
          prizeType: selectedMatchResults.prizeType || null,
          results: resultsArray,
          createdAt: serverTimestamp(),
        });

        tx.update(doc(db, 'matches', matchId), { status: 'completed' });
      });

      setIsResultModalOpen(false);
      alert('Results declared successfully! Winning coins credited to players.');
    } catch (e: any) {
      console.error("Error during result submission:", e);
      alert(e?.message || 'Failed to declare results. Please verify admin permissions.');
      handleFirestoreError(e, OperationType.UPDATE, `matches/${selectedMatchResults.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract all unique sections combining presets, gameModes, and Firestore gameRules docs
  const allAvailableRuleSections = React.useMemo(() => {
    const map: Record<string, { id: string; title: string; category: string; rulesCount: number; isPreset: boolean }> = {};

    // 1. Add standard presets
    Object.keys(RULE_PRESETS).forEach(key => {
      const p = RULE_PRESETS[key];
      const firestoreDoc = gameRulesDocs[key];
      map[key] = {
        id: key,
        title: firestoreDoc?.title || p.title,
        category: firestoreDoc?.category || p.category,
        rulesCount: firestoreDoc?.rules ? firestoreDoc.rules.length : p.rules.length,
        isPreset: true
      };
    });

    // 2. Add gameModes from Firestore
    gameModesList.forEach(m => {
      const rawKey = (m.id || m.title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
      if (rawKey && !map[rawKey]) {
        const firestoreDoc = gameRulesDocs[rawKey];
        map[rawKey] = {
          id: rawKey,
          title: firestoreDoc?.title || m.title || m.subtitle || rawKey.replace(/_/g, ' '),
          category: firestoreDoc?.category || m.category || 'Custom Mode',
          rulesCount: firestoreDoc?.rules?.length || 0,
          isPreset: false
        };
      }
    });

    // 3. Add any existing documents from gameRulesDocs
    Object.keys(gameRulesDocs).forEach(key => {
      const docData = gameRulesDocs[key];
      if (!map[key]) {
        map[key] = {
          id: key,
          title: docData.title || key.replace(/_/g, ' '),
          category: docData.category || 'Custom Section',
          rulesCount: docData.rules?.length || 0,
          isPreset: false
        };
      } else {
        map[key].title = docData.title || map[key].title;
        map[key].category = docData.category || map[key].category;
        map[key].rulesCount = docData.rules?.length || 0;
      }
    });

    return Object.values(map);
  }, [gameRulesDocs, gameModesList]);

  // Sync active section content whenever section changes or Firestore rules update
  useEffect(() => {
    const currentDoc = gameRulesDocs[activeRuleTab];
    if (currentDoc && currentDoc.rules && currentDoc.rules.length > 0) {
      setRuleList(currentDoc.rules);
      setRuleText(currentDoc.rules.join('\n'));
      setActiveSectionTitle(currentDoc.title || activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory(currentDoc.category || 'General');
    } else if (RULE_PRESETS[activeRuleTab]) {
      const p = RULE_PRESETS[activeRuleTab];
      setRuleList(p.rules);
      setRuleText(p.rules.join('\n'));
      setActiveSectionTitle(p.title);
      setActiveSectionCategory(p.category);
    } else {
      const defaultSample = [
        'Fair Play: No hacking, scripts or third-party tools allowed.',
        'Device Requirements: Mobile & tablet devices only. Strictly no emulators.',
        'Verification: High-definition victory/final scorecard screenshot mandatory in case of dispute.',
        'Match Entry: Room closes 2 minutes before match start time.',
        'Admin Decision: Admin decision is final and binding for all participants.'
      ];
      setRuleList(defaultSample);
      setRuleText(defaultSample.join('\n'));
      setActiveSectionTitle(activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory('General');
    }
  }, [activeRuleTab, gameRulesDocs]);

  // Save current active section rules
  const handleSaveCurrentSectionRules = async () => {
    setIsProcessing(true);
    try {
      const finalRules = ruleEditMode === 'raw' 
        ? ruleText.split('\n').map(r => r.trim()).filter(r => r.length > 0)
        : ruleList.map(r => r.trim()).filter(r => r.length > 0);

      if (finalRules.length === 0) {
        alert('Please provide at least one rule item.');
        setIsProcessing(false);
        return;
      }

      await setDoc(doc(db, 'gameRules', activeRuleTab), {
        id: activeRuleTab,
        title: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
        section: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
        category: activeSectionCategory.trim() || 'General',
        rules: finalRules,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setRuleList(finalRules);
      setRuleText(finalRules.join('\n'));
      alert(`Rules for "${activeSectionTitle}" saved successfully!`);
    } catch (e) {
      console.error("Error saving rules:", e);
      handleFirestoreError(e, OperationType.UPDATE, `gameRules/${activeRuleTab}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a single rule to interactive list
  const handleAddSingleRule = () => {
    if (!newSingleRuleText.trim()) return;
    const updated = [...ruleList, newSingleRuleText.trim()];
    setRuleList(updated);
    setRuleText(updated.join('\n'));
    setNewSingleRuleText('');
  };

  // Delete a single rule from interactive list
  const handleDeleteSingleRule = (index: number) => {
    const updated = ruleList.filter((_, i) => i !== index);
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  // Move rule up or down
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === ruleList.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...ruleList];
    const item = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = item;
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  // Load a preset template into active section
  const handleApplyPresetTemplate = (presetKey: string) => {
    if (RULE_PRESETS[presetKey]) {
      const preset = RULE_PRESETS[presetKey];
      if (confirm(`Load "${preset.title}" rules into the current section editor?`)) {
        setRuleList([...preset.rules]);
        setRuleText(preset.rules.join('\n'));
      }
    }
  };

  // Create new section rules document
  const handleAddNewSectionSubmit = async () => {
    if (!newSectionForm.title.trim()) {
      alert('Please enter a section title / name');
      return;
    }
    const cleanId = newSectionForm.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    if (!cleanId) {
      alert('Invalid section title');
      return;
    }

    setIsProcessing(true);
    try {
      const starterTemplate = RULE_PRESETS[newSectionForm.template] || RULE_PRESETS.battle_royale;
      const initialRules = [...starterTemplate.rules];

      await setDoc(doc(db, 'gameRules', cleanId), {
        id: cleanId,
        title: newSectionForm.title.trim(),
        section: newSectionForm.title.trim(),
        category: newSectionForm.category.trim() || newSectionForm.title.trim(),
        rules: initialRules,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setActiveRuleTab(cleanId);
      setActiveSectionTitle(newSectionForm.title.trim());
      setActiveSectionCategory(newSectionForm.category.trim() || newSectionForm.title.trim());
      setRuleList(initialRules);
      setRuleText(initialRules.join('\n'));
      setIsAddSectionModalOpen(false);
      setNewSectionForm({ title: '', category: '', template: 'battle_royale' });
      alert(`Section rules for "${newSectionForm.title}" created successfully!`);
    } catch (err) {
      console.error('Failed to create new rule section:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete custom section rules
  const handleDeleteCustomSectionRules = async (secId: string, secTitle: string) => {
    if (['battle_royale', 'clash_squad', 'lone_wolf'].includes(secId)) {
      alert('Default game mode sections cannot be deleted. You can edit their rules instead.');
      return;
    }
    if (!confirm(`Are you sure you want to delete rules for section "${secTitle}"?`)) return;

    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'gameRules', secId));
      setActiveRuleTab('battle_royale');
      alert(`Rules for section "${secTitle}" removed.`);
    } catch (err) {
      console.error('Failed to delete section rules:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Room ID & Password Modal Handlers (Stored privately in matchCredentials/{matchId})
  const handleOpenDeclareRoomModal = (m: Tournament) => {
    const privateCreds = matchCredentialsMap[m.id];
    setSelectedDeclareRoomMatch(m);
    setDeclareRoomForm({
      roomId: privateCreds?.roomId || m.roomId || '',
      roomPassword: privateCreds?.roomPassword || m.roomPassword || '',
      setStatusLive: m.status !== 'completed',
      customNotes: privateCreds?.roomNotes || m.roomNotes || '',
      sendNotificationOnRoomDeclare: true
    });
    setIsDeclareRoomModalOpen(true);
  };

  const handleSaveDeclareRoom = async () => {
    if (!selectedDeclareRoomMatch) return;
    const cleanRoomId = declareRoomForm.roomId.trim();
    const cleanPass = declareRoomForm.roomPassword.trim();
    const cleanNotes = declareRoomForm.customNotes.trim();
    if (!cleanRoomId && !cleanPass) {
      alert('Please enter Room ID and Password (or use Clear Credentials).');
      return;
    }
    setIsProcessing(true);
    try {
      const matchId = selectedDeclareRoomMatch.id;
      const hasCreds = Boolean(cleanRoomId && cleanPass);

      const batch = writeBatch(db);
      // 1. Store actual Room ID & Password ONLY inside protected matchCredentials/{matchId}
      batch.set(doc(db, 'matchCredentials', matchId), {
        matchId,
        roomId: cleanRoomId,
        roomPassword: cleanPass,
        roomNotes: cleanNotes,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 2. Keep public match doc sanitized (never expose plaintext Room ID / Pass to non-joined users)
      const matchUpdates: any = {
        hasRoomCredentials: hasCreds,
        roomId: '',
        roomPassword: '',
        roomNotes: '',
        roomDeclaredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (declareRoomForm.setStatusLive && selectedDeclareRoomMatch.status !== 'completed') {
        matchUpdates.status = 'ongoing';
      }
      batch.update(doc(db, 'matches', matchId), matchUpdates);
      await batch.commit();

      // 3. Push notification ONLY to players joined in this match (do not leak raw IDP in notification body)
      if (declareRoomForm.sendNotificationOnRoomDeclare && cleanRoomId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            title: `Room IDP Ready: ${selectedDeclareRoomMatch.title}`,
            message: 'Room ID & Password have been published! Go to Ongoing → View IDP to enter the custom room.',
            type: 'room_creds',
            audience: 'match',
            targetMatchId: matchId,
            targetMatchTitle: selectedDeclareRoomMatch.title,
            actionPage: Page.TOURNAMENTS,
            actionText: 'View IDP',
            createdAt: serverTimestamp(),
            readBy: []
          });
        } catch (notifErr) {
          console.warn('Could not auto push notification:', notifErr);
        }
      }

      setIsDeclareRoomModalOpen(false);
      setSelectedDeclareRoomMatch(null);
      alert('Room ID & Password published securely for joined players only!');
    } catch (err: any) {
      console.error('Failed to declare room:', err);
      alert(err?.message || 'Failed to publish room credentials.');
      handleFirestoreError(err, OperationType.UPDATE, `matchCredentials/${selectedDeclareRoomMatch.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearRoomCredentials = async (matchId: string) => {
    if (!confirm('Are you sure you want to clear the Room ID & Password for this match?')) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'matchCredentials', matchId), {
        matchId,
        roomId: '',
        roomPassword: '',
        roomNotes: '',
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.update(doc(db, 'matches', matchId), {
        hasRoomCredentials: false,
        roomId: '',
        roomPassword: '',
        roomNotes: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      if (isDeclareRoomModalOpen) {
        setIsDeclareRoomModalOpen(false);
        setSelectedDeclareRoomMatch(null);
      }
      alert('Room credentials cleared successfully.');
    } catch (err: any) {
      console.error('Failed to clear room:', err);
      alert(err?.message || 'Failed to clear room credentials.');
      handleFirestoreError(err, OperationType.UPDATE, `matchCredentials/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyCredential = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveSettings = async (data: any) => {
    const rawBaseUrl = String(data?.referral?.baseUrl || '').trim();
    if (rawBaseUrl && isBlockedShareUrl(rawBaseUrl)) {
      alert('Please do not use AI Studio, localhost, or GitHub URLs in Base Referral URL. Leave it blank or enter your public website domain (e.g. https://fxarena.in).');
      return;
    }
    const rawApkUrl = String(data?.referral?.apkDownloadUrl || '').trim();
    if (rawApkUrl && isBlockedShareUrl(rawApkUrl)) {
      alert('Please do not use AI Studio, localhost, or GitHub URLs in APK Download Link. Leave it blank so the clean download link is used automatically.');
      return;
    }
    setIsProcessing(true);
    try {
      await setDoc(doc(db, 'appSettings', 'referral_support'), data, { merge: true });
      alert('Settings updated successfully!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!imageUrl) return alert('Banner image is required');
    setIsProcessing(true);
    try {
      const safeImageUrl = imageUrl.startsWith('data:')
        ? await import('../utils/imageCompressor').then((m) => m.compactImageForFirestore(imageUrl, 420000))
        : imageUrl.trim();

      const bannerData = {
        imageUrl: safeImageUrl,
        redirectUrl: (bannerType === 'main' || bannerType === 'offer') ? redirectUrl : '',
        type: bannerType,
        order: Number(bannerOrder),
        isActive: true,
        updatedAt: serverTimestamp()
      };

      if (editingBanner?.id) {
        await updateDoc(doc(db, 'banners', editingBanner.id), bannerData);
      } else {
        await addDoc(collection(db, 'banners'), {
          ...bannerData,
          createdAt: serverTimestamp()
        });
      }
      setIsBannerModalOpen(false);
      setEditingBanner(null);
      setImageUrl('');
      setRedirectUrl('');
    } catch (e: any) {
      handleFirestoreError(e, OperationType.WRITE, 'banners');
      alert(e?.message || 'Could not save banner. Please try a smaller image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this banner? This action cannot be undone.')) return;
    
    setDeletingBannerId(id);
    console.log("Deleting banner:", id);
    
    try {
      await deleteDoc(doc(db, 'banners', id));
    } catch (e) {
      console.error("Error deleting banner:", e);
      alert('Upload failed, try again');
      handleFirestoreError(e, OperationType.DELETE, `banners/${id}`);
    } finally {
      setDeletingBannerId(null);
    }
  };

  const openGatewayModal = (gId?: string, existing?: PaymentGateway | null) => {
    const defaultNames: Record<string, string> = {
      zapupi: 'ZapUPI',
      cashfree: 'Cashfree PG',
      razorpay: 'Razorpay',
      transupi: 'TransUPI',
      custom: 'Custom Gateway'
    };
    const resolvedId = existing?.id || gId || '';
    setEditingGateway(existing || (resolvedId ? { id: resolvedId, name: defaultNames[resolvedId] || resolvedId.toUpperCase(), isActive: false } : null));
    setGatewayForm({
      id: resolvedId,
      name: existing?.name || (resolvedId ? (defaultNames[resolvedId] || resolvedId.toUpperCase()) : ''),
      apiKey: existing?.apiKey || '',
      secretKey: existing?.secretKey || '',
      merchantId: existing?.merchantId || '',
      webhookSecret: existing?.webhookSecret || '',
      upiId: existing?.upiId || '',
      isProduction: Boolean(existing?.isProduction)
    });
    setIsGatewayModalOpen(true);
  };

  const handleToggleGateway = async (gatewayId: string, currentStatus: boolean) => {
    setPaymentFeedback(null);
    const targetGateway = paymentGateways.find(g => g.id === gatewayId);
    if (!currentStatus && (!targetGateway || (!targetGateway.apiKey && !targetGateway.merchantId))) {
      setPaymentFeedback({ type: 'error', message: 'Please enter your API Key / Credentials first before activating this automatic gateway.' });
      openGatewayModal(gatewayId, targetGateway || null);
      return;
    }

    setIsProcessing(true);
    try {
      if (!currentStatus) {
        // Enforce only one active gateway: deactivate all others first
        const batch = writeBatch(db);
        paymentGateways.forEach(g => {
          if (g.isActive) {
            batch.update(doc(db, 'paymentSettings', g.id), { isActive: false });
          }
        });
        batch.update(doc(db, 'paymentSettings', gatewayId), { 
          isActive: true,
          updatedAt: serverTimestamp() 
        });
        // Sync sanitized public active gateway metadata (no API keys/secrets exposed)
        batch.set(doc(db, 'appSettings', 'active_gateway'), {
          id: gatewayId,
          name: targetGateway.name || gatewayId.toUpperCase(),
          isActive: true,
          isProduction: Boolean(targetGateway.isProduction),
          isConfigured: Boolean(targetGateway.apiKey || targetGateway.merchantId),
          updatedAt: serverTimestamp()
        }, { merge: true });
        // Automatically switch Add Cash off Manual QR so Automatic Gateway runs immediately
        batch.set(doc(db, 'appSettings', 'payment_qr'), {
          isActive: false,
          paymentQr: {
            qrImageUrl: qrForm.qrImageUrl || '',
            amountQrs: qrForm.amountQrs || {},
            upiId: qrForm.upiId || '',
            merchantName: qrForm.merchantName || 'FX Arena eSport',
            isActive: false
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
        await batch.commit();
        setQrForm(prev => ({ ...prev, isActive: false }));
        setPaymentFeedback({ type: 'success', message: `${targetGateway?.name || gatewayId.toUpperCase()} activated for Add Cash.` });
      } else {
        const batch = writeBatch(db);
        batch.update(doc(db, 'paymentSettings', gatewayId), { 
          isActive: false,
          updatedAt: serverTimestamp() 
        });
        batch.set(doc(db, 'appSettings', 'active_gateway'), {
          id: gatewayId,
          isActive: false,
          updatedAt: serverTimestamp()
        }, { merge: true });
        await batch.commit();
        setPaymentFeedback({ type: 'success', message: 'Automatic gateway paused.' });
      }
    } catch (e: any) {
      setPaymentFeedback({ type: 'error', message: e?.message || 'Failed to update gateway status.' });
      handleFirestoreError(e, OperationType.UPDATE, `paymentSettings/${gatewayId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveGateway = async () => {
    setPaymentFeedback(null);
    if (!gatewayForm.name.trim()) {
      setPaymentFeedback({ type: 'error', message: 'Gateway Name is required.' });
      return;
    }
    if (!gatewayForm.apiKey.trim() && !gatewayForm.merchantId.trim()) {
      setPaymentFeedback({ type: 'error', message: 'Please enter at least API Key or Merchant ID.' });
      return;
    }
    setIsProcessing(true);
    try {
      const gId = (gatewayForm.id || editingGateway?.id || gatewayForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/^_+|_+$/g, '');
      const existingGw = paymentGateways.find(g => g.id === gId);
      const isGwActive = existingGw ? Boolean(existingGw.isActive) : false;
      const gatewayData = {
        id: gId,
        name: gatewayForm.name.trim(),
        apiKey: gatewayForm.apiKey.trim(),
        secretKey: gatewayForm.secretKey.trim(),
        merchantId: gatewayForm.merchantId.trim(),
        webhookSecret: gatewayForm.webhookSecret.trim(),
        upiId: gatewayForm.upiId.trim(),
        isProduction: Boolean(gatewayForm.isProduction),
        isActive: isGwActive,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'paymentSettings', gId), gatewayData, { merge: true });
      if (isGwActive) {
        await setDoc(doc(db, 'appSettings', 'active_gateway'), {
          id: gId,
          name: gatewayData.name,
          isActive: true,
          isProduction: gatewayData.isProduction,
          isConfigured: Boolean(gatewayData.apiKey || gatewayData.merchantId),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      
      setIsGatewayModalOpen(false);
      setEditingGateway(null);
      setGatewayForm({
        id: '',
        name: '',
        apiKey: '',
        secretKey: '',
        merchantId: '',
        webhookSecret: '',
        upiId: '',
        isProduction: false
      });
      setPaymentFeedback({
        type: 'success',
        message: `${gatewayData.name} credentials saved! Toggle its switch ON whenever you want to switch from Manual QR to Automatic Gateway.`
      });
    } catch (e: any) {
      setPaymentFeedback({ type: 'error', message: e?.message || 'Failed to save gateway credentials.' });
      handleFirestoreError(e, OperationType.WRITE, 'paymentSettings');
    } finally {
      setIsProcessing(false);
    }
  };

  const QR_AMOUNT_OPTIONS = ['default', '15', '25', '50', '100', '200', '500', '1000'] as const;

  const activeQrUrl = selectedQrAmountKey === 'default'
    ? qrForm.qrImageUrl
    : (qrForm.amountQrs?.[selectedQrAmountKey] || '');

  const setActiveQrUrl = (url: string) => {
    if (selectedQrAmountKey === 'default') {
      setQrForm(prev => ({ ...prev, qrImageUrl: url }));
    } else {
      setQrForm(prev => ({
        ...prev,
        amountQrs: {
          ...(prev.amountQrs || {}),
          [selectedQrAmountKey]: url
        }
      }));
    }
  };

  const compactQrDataUrl = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 360;
        const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
        const w = Math.max(120, Math.round((img.width || maxDim) * scale));
        const h = Math.max(120, Math.round((img.height || maxDim) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPaymentFeedback(null);
    setIsUploadingQr(true);
    setQrUploadProgress(15);
    try {
      let downloadURL = await uploadOriginalImage(file, (progress) => {
        setQrUploadProgress(progress);
      });
      if (downloadURL.startsWith('data:') && downloadURL.length > 80000) {
        downloadURL = await compactQrDataUrl(downloadURL);
      }
      setActiveQrUrl(downloadURL);
      setQrUploadProgress(100);
      setPaymentFeedback({
        type: 'success',
        message: `${selectedQrAmountKey === 'default' ? 'Default' : `₹${selectedQrAmountKey}`} QR image uploaded! Click "Save QR Scanner" below to publish it.`
      });
    } catch (error: any) {
      console.error('QR Upload Error:', error);
      setPaymentFeedback({ type: 'error', message: error?.message || 'QR image upload failed, try again.' });
    } finally {
      setIsUploadingQr(false);
      e.target.value = '';
    }
  };

  const handleSaveQrSettings = async () => {
    setPaymentFeedback(null);
    const cleanDefaultUrl = qrForm.qrImageUrl.trim();
    if (cleanDefaultUrl.startsWith('data:') && cleanDefaultUrl.length > 200000) {
      setPaymentFeedback({ type: 'error', message: 'Default QR image is too large to save directly. Please re-upload a smaller image or paste an image URL.' });
      return;
    }

    const cleanAmountQrs: Record<string, string> = {};
    for (const [amtKey, rawVal] of Object.entries(qrForm.amountQrs || {})) {
      const val = typeof rawVal === 'string' ? rawVal.trim() : '';
      if (!val) continue;
      if (val.startsWith('data:') && val.length > 200000) {
        setPaymentFeedback({ type: 'error', message: `₹${amtKey} QR image is too large. Please re-upload a smaller image or paste an image URL.` });
        return;
      }
      cleanAmountQrs[amtKey] = val.startsWith('data:') ? val : val.slice(0, 2500);
    }

    const hasAnyQr = Boolean(cleanDefaultUrl || Object.keys(cleanAmountQrs).length > 0);
    if (qrForm.isActive && !hasAnyQr) {
      setPaymentFeedback({ type: 'error', message: 'Please upload at least one QR Scanner image (Default or for an amount option) first.' });
      return;
    }

    setIsProcessing(true);
    try {
      const qrPayload = {
        qrImageUrl: cleanDefaultUrl.startsWith('data:') ? cleanDefaultUrl : cleanDefaultUrl.slice(0, 2500),
        amountQrs: cleanAmountQrs,
        upiId: qrForm.upiId.trim().slice(0, 128),
        merchantName: (qrForm.merchantName.trim() || 'FX Arena eSport').slice(0, 100),
        isActive: qrForm.isActive
      };
      await setDoc(doc(db, 'appSettings', 'payment_qr'), {
        ...qrPayload,
        paymentQr: qrPayload,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setPaymentFeedback({ type: 'success', message: 'QR Scanner settings saved! Users will now see the QR when clicking Pay with QR Scanner.' });
    } catch (e: any) {
      setPaymentFeedback({ type: 'error', message: e?.message || 'Failed to save QR Scanner settings.' });
      handleFirestoreError(e, OperationType.WRITE, 'appSettings/payment_qr');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveTransaction = async (tx: any) => {
    if (!tx?.id || String(tx.status || '').toLowerCase().trim() !== 'pending') return;
    setPaymentFeedback(null);
    setIsProcessing(true);
    try {
      const txType = String(tx.type || '').toLowerCase().trim();
      const creditAmount = Math.round((Number(tx.amount) || 0) * 100) / 100;

      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('Transaction not found');
        const currentStatus = String(txSnap.data()?.status || '').toLowerCase().trim();
        if (currentStatus !== 'pending') throw new Error('Transaction already processed');

        const userRef = doc(db, 'users', tx.userId);
        const userSnap = await transaction.get(userRef);

        if (txType === 'deposit') {
          if (!userSnap.exists()) {
            throw new Error('Player account does not exist anymore.');
          }
          const uData = userSnap.data() as any;
          if (!uData?.wallet) {
            transaction.update(userRef, {
              wallet: {
                deposit: Math.round(((Number(uData?.walletBalance || 0)) + creditAmount) * 100) / 100,
                winnings: Number(uData?.winnings || 0),
                bonus: Number(uData?.bonus || 0),
              },
            });
          } else {
            transaction.update(userRef, {
              'wallet.deposit': increment(creditAmount),
            });
          }
        }

        transaction.update(txRef, { status: 'completed' });
      });

      setPaymentFeedback({ type: 'success', message: `Approved ₹${creditAmount} ${txType} request and credited user wallet.` });
    } catch (e: any) {
      const msg = e?.message || 'Failed to approve transaction';
      const friendlyMsg = msg.toLowerCase().includes('permission')
        ? 'Permission denied: please verify your admin email at the top banner or sign in with your main admin account.'
        : msg;
      setPaymentFeedback({ type: 'error', message: friendlyMsg });
      handleFirestoreError(e, OperationType.UPDATE, `transactions/${tx.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectTransaction = async (tx: any) => {
    if (!tx?.id || String(tx.status || '').toLowerCase().trim() !== 'pending') return;
    const txType = String(tx.type || '').toLowerCase().trim();
    const isWithdraw = txType === 'withdraw' || txType === 'withdrawal';
    const refundAmount = Math.round((Number(tx.amount) || 0) * 100) / 100;
    setPaymentFeedback(null);
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('Transaction not found');
        const currentStatus = String(txSnap.data()?.status || '').toLowerCase().trim();
        if (currentStatus !== 'pending') throw new Error('Transaction already processed');

        const userRef = doc(db, 'users', tx.userId);
        const userSnap = await transaction.get(userRef);

        if (isWithdraw && userSnap.exists()) {
          const uData = userSnap.data() as any;
          if (!uData?.wallet) {
            transaction.update(userRef, {
              wallet: {
                deposit: Number(uData?.walletBalance || 0),
                winnings: Math.round(((Number(uData?.winnings || 0)) + refundAmount) * 100) / 100,
                bonus: Number(uData?.bonus || 0),
              },
            });
          } else {
            transaction.update(userRef, {
              'wallet.winnings': increment(refundAmount),
            });
          }
        }

        transaction.update(txRef, { status: 'failed' });
      });
      setPaymentFeedback({ type: 'success', message: `Rejected ₹${refundAmount} ${txType} request.` });
    } catch (e: any) {
      const msg = e?.message || 'Failed to reject transaction';
      const friendlyMsg = msg.toLowerCase().includes('permission')
        ? 'Permission denied: please verify your admin email at the top banner or sign in with your main admin account.'
        : msg;
      setPaymentFeedback({ type: 'error', message: friendlyMsg });
      handleFirestoreError(e, OperationType.UPDATE, `transactions/${tx.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="text-purple-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-lg mx-auto bg-background min-h-screen">
      <div className="px-5 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => onPageChange(Page.PROFILE)}
              className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="text-xl font-bold tracking-tighter uppercase italic text-white leading-none">
                {isStaffRole ? 'Staff' : 'Admin'} <span className="text-purple-500">Panel</span>
              </h2>
              <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mt-1">
                {isStaffRole ? 'Match • IDP • Result • Notification Control' : 'Production Version 2.0'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Live</span>
          </div>
        </div>

        {needsAdminVerification && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-snug">
                <p className="font-black uppercase tracking-wider text-amber-300">
                  {isStaffRole ? 'Staff Email Verification Needed' : 'Admin Email Verification Needed'}
                </p>
                <p className="text-neutral-300 mt-0.5">
                  {isStaffRole
                    ? 'To create matches, declare Room IDP, declare results, or send notifications securely, verify your email once.'
                    : 'To approve deposits, declare results, or edit matches securely from this admin account, verify your email once.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (auth.currentUser) {
                      await sendEmailVerification(auth.currentUser);
                      setVerificationFeedback('Verification link sent to your email! Open your inbox, click it, then tap Refresh Status.');
                    }
                  } catch (err: any) {
                    setVerificationFeedback(err?.message || 'Could not send email.');
                  }
                }}
                className="flex-1 py-2 px-3 bg-amber-500 text-black rounded-xl text-[10px] font-black uppercase tracking-wider"
              >
                Send Verification Link
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (auth.currentUser) {
                    await auth.currentUser.reload();
                    await auth.currentUser.getIdToken(true);
                    let hasRoleDoc = false;
                    try {
                      if (isStaffRole) {
                        const sDoc = await getDoc(doc(db, 'staff', auth.currentUser.uid));
                        hasRoleDoc = sDoc.exists();
                      } else {
                        const aDoc = await getDoc(doc(db, 'admins', auth.currentUser.uid));
                        hasRoleDoc = aDoc.exists();
                      }
                    } catch {
                      hasRoleDoc = false;
                    }
                    if (auth.currentUser.emailVerified || hasRoleDoc) {
                      setNeedsAdminVerification(false);
                      setVerificationFeedback(null);
                    } else {
                      setVerificationFeedback('Not verified yet. Click the link in your inbox or ask Super Admin to tap "Sync Staff" in Users tab.');
                    }
                  }
                }}
                className="py-2 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-wider"
              >
                Refresh Status
              </button>
            </div>
            {verificationFeedback && (
              <p className="text-[10px] font-bold text-amber-300">{verificationFeedback}</p>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
          {(isStaffRole ? [AdminTab.MATCHES, AdminTab.NOTIFICATIONS] : Object.values(AdminTab)).map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => {
                if (tab === AdminTab.MODES && isFullAdmin) {
                  onPageChange(Page.ADMIN_MODES);
                  return;
                }
                setActiveTab(tab);
              }}
              className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                activeTab === tab 
                  ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30' 
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500'
              }`}
            >
              <span>{tab}</span>
              {isFullAdmin && tab === AdminTab.TRANSACTIONS && pendingTransactionsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[8px] font-black leading-none">
                  {pendingTransactionsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {isFullAdmin && activeTab === AdminTab.DASHBOARD && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Total Users" value={totalUsers} icon={Users} color="text-blue-400" />
                <StatCard label="Total Matches" value={totalMatches} icon={Trophy} color="text-purple-400" />
                <StatCard label="Joined Players" value={totalJoinedPlayers} icon={UsersIcon} color="text-orange-400" />
                <StatCard label="Revenue" value={`₹${totalDeposits - totalWithdrawals}`} icon={DollarSign} color="text-emerald-400" />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => onPageChange(Page.ADMIN_MODES)}
                  className="flex-1 p-6 bg-purple-600/10 border border-purple-500/20 rounded-3xl flex flex-col items-center gap-3 active:scale-95 transition-all shadow-xl"
                >
                  <Gamepad2 className="text-purple-500" size={32} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-500">Manage Game Modes</span>
                </button>
              </div>

              <div className="p-6 bg-neutral-900/60 border border-neutral-800 rounded-3xl mt-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-6 flex items-center gap-2">
                  <Shield size={12} className="text-purple-500" /> System Health
                </h4>
                <div className="space-y-4">
                  <HealthBar label="Database" status="Operational" />
                  <HealthBar label="Auth Service" status="Operational" />
                  <HealthBar label="Storage" status="Optimal" />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.NOTIFICATIONS && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminNotificationsTab 
                matches={matches} 
                users={users} 
                onPageChange={onPageChange} 
              />
            </motion.div>
          )}

          {isFullAdmin && activeTab === AdminTab.USERS && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <input 
                  type="text"
                  placeholder="Search by username..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                />
              </div>

              <div className="space-y-3">
                {users
                  .filter(u =>
                    (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((u) => {
                    const isUserStaff = STAFF_EMAILS.includes((u.email || '').toLowerCase().trim());
                    return (
                      <div 
                        key={u.id}
                        onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, u.id)}
                        className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-between group cursor-pointer hover:border-primary transition-all"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center text-neutral-700 border border-white/5 shrink-0">
                            <Users size={20} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black italic truncate">{u.username}</h4>
                              {isUserStaff && (
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[8px] font-black uppercase tracking-wider">
                                  STAFF
                                </span>
                              )}
                            </div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {isUserStaff && u.id && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await setDoc(doc(db, 'staff', u.id!), {
                                    email: (u.email || '').toLowerCase().trim(),
                                    role: 'staff',
                                    updatedAt: serverTimestamp(),
                                  }, { merge: true });
                                  alert(`Staff control access synced for ${u.email}!`);
                                } catch (err: any) {
                                  alert(err?.message || 'Failed to sync staff access');
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 text-purple-200 hover:text-white text-[9px] font-black uppercase tracking-wider transition-all"
                            >
                              Sync Staff
                            </button>
                          )}
                          <span className="text-[10px] font-black text-emerald-400 italic">
                            ₹{(u.wallet?.deposit || 0) + (u.wallet?.winnings || 0) + (u.wallet?.bonus || 0)}
                          </span>
                          {u.isBanned && <Ban size={14} className="text-red-500" />}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.MATCHES && (
            <motion.div
              key="matches"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="space-y-4">
                <button 
                  type="button"
                  onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                  className="w-full py-5 bg-purple-600 hover:bg-purple-500 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-600/30 active:scale-[0.98] transition-all text-white"
                >
                  <Plus size={18} />
                  <span className="text-xs font-black uppercase tracking-widest">Create New Match</span>
                </button>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                  <input 
                    type="text"
                    placeholder="Search by Match ID, Title or Section..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                {/* Match Status Filters */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id: 'all', label: `All (${matches.length})` },
                    { 
                      id: 'need_room', 
                      label: `⚠️ Need Room ID (${matches.filter(m => {
                        const c = matchCredentialsMap[m.id];
                        const hasC = Boolean((c?.roomId && c?.roomPassword) || m.hasRoomCredentials || (m.roomId && m.roomPassword));
                        return !hasC && m.status !== 'completed';
                      }).length})` 
                    },
                    { 
                      id: 'room_ready', 
                      label: `🔑 Room Ready (${matches.filter(m => {
                        const c = matchCredentialsMap[m.id];
                        const hasC = Boolean((c?.roomId && c?.roomPassword) || m.hasRoomCredentials || (m.roomId && m.roomPassword));
                        return hasC && m.status !== 'completed';
                      }).length})` 
                    },
                    { 
                      id: 'live', 
                      label: `⚡ Live (${matches.filter(m => m.status === 'ongoing').length})` 
                    },
                    { 
                      id: 'completed', 
                      label: `🏆 Completed (${matches.filter(m => m.status === 'completed').length})` 
                    }
                  ].map((filterItem) => (
                    <button
                      type="button"
                      key={filterItem.id}
                      onClick={() => setMatchStatusFilter(filterItem.id as any)}
                      className={`px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                        matchStatusFilter === filterItem.id
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-sm'
                          : 'bg-neutral-900/80 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {filterItem.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {matches
                  .filter(m => {
                    const matchText = (m.displayId || '') + ' ' + (m.title || '') + ' ' + (m.section || '') + ' ' + (m.map || '');
                    const matchesSearch = matchText.toLowerCase().includes(searchTerm.toLowerCase());
                    if (!matchesSearch) return false;

                    const cred = matchCredentialsMap[m.id];
                    const hasC = Boolean((cred?.roomId && cred?.roomPassword) || m.hasRoomCredentials || (m.roomId && m.roomPassword));

                    if (matchStatusFilter === 'need_room') {
                      return !hasC && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'room_ready') {
                      return hasC && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'live') {
                      return m.status === 'ongoing';
                    }
                    if (matchStatusFilter === 'completed') {
                      return m.status === 'completed';
                    }
                    return true;
                  })
                  .map((m) => {
                    const cred = matchCredentialsMap[m.id];
                    const displayRoomId = cred?.roomId || m.roomId || '';
                    const displayRoomPass = cred?.roomPassword || m.roomPassword || '';
                    const hasRoomCreds = Boolean(displayRoomId && displayRoomPass);
                    return (
                      <div key={m.id} className="p-5 bg-neutral-900 border border-neutral-800 rounded-3xl relative overflow-hidden group shadow-lg">
                        <div className="absolute top-0 right-0 p-4 flex gap-2">
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDuplicateMatch(m);
                            }}
                            className="p-2 bg-purple-500/10 text-purple-500 rounded-lg hover:bg-purple-500 transition-colors hover:text-white"
                            title="Duplicate Match"
                          >
                            <Copy size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEditMatch(m);
                            }}
                            className="p-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 transition-colors hover:text-white"
                            title="Edit Match"
                          >
                            <Edit2 size={14} />
                          </button>
                          {isFullAdmin && (
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsDeleteConfirmOpen({ isOpen: true, matchId: m.id });
                              }}
                              className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 transition-colors hover:text-white"
                              title="Delete Match"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-2">
                             <span className="text-[10px] font-black text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-lg border border-purple-500/20">
                               {m.displayId || '#000'}
                             </span>
                             <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-md">
                               {m.section || m.mode || 'Battle Royale'}
                             </span>
                           </div>
                           {m.status === 'completed' ? (
                            <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                              Completed
                            </span>
                          ) : m.status === 'ongoing' ? (
                            <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full animate-pulse">
                              Live / Ongoing
                            </span>
                          ) : (
                            <span className="bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                              Upcoming
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-black italic pr-16 mb-3 text-white">{m.title}</h4>

                        <div className="flex gap-4 mb-4">
                          <div className="flex items-center gap-1.5 text-neutral-400">
                            <Clock size={12} className="text-neutral-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest">{formatMatchTime(m.time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-neutral-400">
                            <MapIcon size={12} className="text-neutral-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest">{m.map}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-3 border-y border-neutral-800/80">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Players Joined</p>
                            <p className="text-xs font-black italic text-white">{m.playersCount}/{m.totalSlots || m.maxPlayers}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Entry Fee</p>
                            <p className="text-xs font-black text-emerald-400 italic leading-none">{m.entryFee === 0 ? 'FREE' : `₹${m.entryFee}`}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Prize Pool</p>
                            <p className="text-xs font-black text-amber-400 italic leading-none">{m.prizeType === 'perKill' ? `₹${m.perKillAmount}/kill` : `₹${m.prizePool}`}</p>
                          </div>
                        </div>

                        {/* Room Credentials Banner */}
                        <div className="mt-4 p-3.5 rounded-2xl border bg-black/60 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key size={14} className={hasRoomCreds ? "text-emerald-400" : "text-amber-400"} />
                              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">Room Credentials</span>
                            </div>
                            {hasRoomCreds ? (
                              <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                Declared & Live
                              </span>
                            ) : (
                              <span className="text-[8px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                Pending
                              </span>
                            )}
                          </div>

                          {hasRoomCreds ? (
                            <div className="grid grid-cols-2 gap-2 bg-neutral-900/90 p-2.5 rounded-xl border border-neutral-800">
                              <div className="flex items-center justify-between pr-1">
                                <div>
                                  <p className="text-[7px] font-black text-neutral-500 uppercase">Room ID</p>
                                  <p className="text-xs font-black text-white font-mono">{displayRoomId}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyCredential(displayRoomId, `room_${m.id}`)}
                                  className="p-1 text-neutral-400 hover:text-white"
                                  title="Copy Room ID"
                                >
                                  {copiedKey === `room_${m.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                              <div className="flex items-center justify-between pr-1 border-l border-neutral-800 pl-2">
                                <div>
                                  <p className="text-[7px] font-black text-neutral-500 uppercase">Password</p>
                                  <p className="text-xs font-black text-white font-mono">{displayRoomPass}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyCredential(displayRoomPass, `pass_${m.id}`)}
                                  className="p-1 text-neutral-400 hover:text-white"
                                  title="Copy Password"
                                >
                                  {copiedKey === `pass_${m.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[9px] font-bold text-neutral-500 italic">
                              Room ID & Password not declared yet. Only joined players will see saved credentials.
                            </p>
                          )}

                          {/* Quick Inline Inputs */}
                          <div className="flex items-center gap-2 pt-1">
                            <input 
                              type="text" 
                              placeholder="Room ID"
                              defaultValue={displayRoomId}
                              id={`quick_room_${m.id}`}
                              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-[10px] font-bold text-white outline-none focus:border-purple-500 placeholder:text-neutral-600"
                            />
                            <input 
                              type="text" 
                              placeholder="Pass"
                              defaultValue={displayRoomPass}
                              id={`quick_pass_${m.id}`}
                              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-[10px] font-bold text-white outline-none focus:border-purple-500 placeholder:text-neutral-600"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const idInput = document.getElementById(`quick_room_${m.id}`) as HTMLInputElement;
                                const passInput = document.getElementById(`quick_pass_${m.id}`) as HTMLInputElement;
                                const rId = idInput ? idInput.value.trim() : '';
                                const rPass = passInput ? passInput.value.trim() : '';
                                if (!rId && !rPass) {
                                  alert('Please enter Room ID and Password first.');
                                  return;
                                }
                                try {
                                  const batch = writeBatch(db);
                                  batch.set(doc(db, 'matchCredentials', m.id), {
                                    matchId: m.id,
                                    roomId: rId,
                                    roomPassword: rPass,
                                    updatedAt: serverTimestamp()
                                  }, { merge: true });
                                  const updates: any = {
                                    hasRoomCredentials: Boolean(rId && rPass),
                                    roomId: '',
                                    roomPassword: '',
                                    updatedAt: serverTimestamp()
                                  };
                                  if (rId && m.status === 'upcoming') {
                                    updates.status = 'ongoing';
                                  }
                                  batch.update(doc(db, 'matches', m.id), updates);
                                  await batch.commit();
                                  alert('Room credentials updated securely for joined players!');
                                } catch (err: any) {
                                  console.error('Quick save room failed:', err);
                                  alert(err?.message || 'Failed to save Room ID & Password.');
                                  handleFirestoreError(err, OperationType.UPDATE, `matchCredentials/${m.id}`);
                                }
                              }}
                              className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl border border-neutral-700 active:scale-95 transition-all"
                              title="Save Credentials Quick"
                            >
                              <Save size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Action Buttons: Declare Room Modal & Declare Result */}
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <button 
                            type="button"
                            onClick={() => handleOpenDeclareRoomModal(m)}
                            className="py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                          >
                            <Key size={13} className="text-purple-400" />
                            {hasRoomCreds ? 'Edit Room Info' : 'Declare Room'}
                          </button>

                          {m.status !== 'completed' ? (
                            <button 
                              type="button"
                              onClick={() => handleDeclareResult(m)}
                              className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                            >
                              <Trophy size={13} />
                              Declare Result
                            </button>
                          ) : (
                            <div className="py-3 bg-neutral-800/60 border border-neutral-800 rounded-xl text-[10px] font-black uppercase tracking-wider text-neutral-500 text-center flex items-center justify-center gap-1.5">
                              <CheckCheck size={13} className="text-emerald-500" />
                              Result Declared
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {isFullAdmin && activeTab === AdminTab.TRANSACTIONS && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {paymentFeedback && (
                <div className={`p-3 rounded-2xl border flex items-start gap-2.5 text-xs font-bold ${
                  paymentFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  {paymentFeedback.type === 'success' ? (
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                  )}
                  <p className="flex-1 leading-snug">{paymentFeedback.message}</p>
                  <button
                    type="button"
                    onClick={() => setPaymentFeedback(null)}
                    className="opacity-60 hover:opacity-100"
                    aria-label="Dismiss"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              )}

              {/* Pending Deposits & Withdrawals Queue */}
              {(() => {
                const pendingList = transactions.filter(t => String(t.status || '').toLowerCase().trim() === 'pending');
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                        <Clock size={12} /> Pending Requests ({pendingList.length})
                      </h4>
                    </div>
                    {pendingList.length === 0 ? (
                      <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                          No pending deposit or withdrawal requests
                        </p>
                      </div>
                    ) : (
                      pendingList.map((t) => {
                        const txUser = users.find(u => u.id === t.userId);
                        const isDeposit = t.type === 'deposit';
                        const isWithdraw = t.type === 'withdraw' || t.type === 'withdrawal';
                        const refValue = t.utrNumber || t.upiId || '';
                        const copyKey = `tx_${t.id}`;

                        return (
                          <div key={t.id} className="p-4 bg-neutral-900 border border-amber-500/30 rounded-2xl space-y-3 shadow-lg">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                    isDeposit
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                  }`}>
                                    {isDeposit ? 'QR Deposit' : 'UPI Withdraw'}
                                  </span>
                                  {t.paymentMethod && (
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                      {t.paymentMethod}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-white">
                                  {txUser?.username || 'Player'}
                                  {txUser?.email ? <span className="text-[10px] text-neutral-500 font-normal ml-1.5">({txUser.email})</span> : null}
                                </p>
                              </div>
                              <p className={`text-base font-black italic ${isDeposit ? 'text-emerald-400' : 'text-orange-400'}`}>
                                {isDeposit ? '+' : '-'}₹{t.amount}
                              </p>
                            </div>

                            {refValue && (
                              <div className="flex items-center justify-between bg-black/60 border border-neutral-800 rounded-xl px-3 py-2">
                                <div className="min-w-0 pr-2">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500 block">
                                    {t.utrNumber ? 'UTR / Reference ID' : 'Payout UPI ID'}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-white truncate block select-all">
                                    {refValue}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCredential(refValue, copyKey)}
                                  className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-white flex items-center gap-1 shrink-0"
                                >
                                  {copiedKey === copyKey ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                  <span>{copiedKey === copyKey ? 'Copied' : 'Copy'}</span>
                                </button>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleApproveTransaction(t)}
                                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                              >
                                <CheckCircle2 size={14} />
                                <span>{isDeposit ? 'Approve & Credit' : 'Mark Paid'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleRejectTransaction(t)}
                                className="py-2.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 disabled:opacity-50 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                              >
                                <XCircle size={14} />
                                <span>{isWithdraw ? 'Reject & Refund' : 'Reject'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })()}

              {/* Full History Log */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500">History Log</h4>
                  <RefreshCw size={14} className="text-neutral-700 animate-spin-slow" />
                </div>
                {transactions.map((t) => {
                  const txUser = users.find(u => u.id === t.userId);
                  const isCredit = t.type === 'deposit' || t.type === 'refund' || t.type === 'win' || t.type === 'bonus';
                  const formattedDate = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Recent';
                  return (
                    <div key={t.id} className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 shrink-0 ${
                          isCredit ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                        }`}>
                          {isCredit ? <Plus size={16} /> : <Minus size={16} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <h4 className="text-[10px] font-black uppercase tracking-widest leading-none text-white">{t.type}</h4>
                            {t.status && (
                              <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                t.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                                'bg-red-500/10 text-red-400'
                              }`}>
                                {t.status}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] font-bold text-neutral-400 truncate">
                            {t.title || `${txUser?.username || 'User'} • ${t.id.slice(0, 8)}`}
                          </p>
                          {(t.paymentMethod || t.upiId || t.utrNumber) && (
                            <p className="text-[8px] font-bold text-neutral-500 truncate mt-0.5">
                              {[t.paymentMethod, t.upiId, t.utrNumber ? `UTR: ${t.utrNumber}` : ''].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-black italic ${
                          isCredit ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {isCredit ? '+' : '-'}₹{t.amount}
                        </p>
                        <p className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">
                          {formattedDate}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.RULES && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Header & Add Section Action */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black italic uppercase tracking-tight text-white flex items-center gap-2">
                    <ListChecks size={16} className="text-purple-400" />
                    Game Mode Regulations
                  </h3>
                  <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mt-0.5">
                    Customize rules for all game mode sections
                  </p>
                </div>
                <button
                  onClick={() => setIsAddSectionModalOpen(true)}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-purple-600/20"
                >
                  <PlusCircle size={13} />
                  Add Section
                </button>
              </div>

              {/* Dynamic Horizontal Section Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {allAvailableRuleSections.map((sec) => {
                  const isActive = activeRuleTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveRuleTab(sec.id)}
                      className={`px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
                        isActive
                          ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                      }`}
                    >
                      <span>{sec.title}</span>
                      <span className={`text-[8px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-black/40 text-purple-200' : 'bg-neutral-800 text-neutral-500'
                      }`}>
                        {sec.rulesCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Section Rule Configuration Card */}
              <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-5">
                {/* Section Meta Inputs */}
                <div className="grid grid-cols-2 gap-3 pb-4 border-b border-neutral-800">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Section Title</label>
                    <input 
                      type="text"
                      value={activeSectionTitle}
                      onChange={(e) => setActiveSectionTitle(e.target.value)}
                      placeholder="e.g. Battle Royale"
                      className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-purple-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Category Tag</label>
                    <input 
                      type="text"
                      value={activeSectionCategory}
                      onChange={(e) => setActiveSectionCategory(e.target.value)}
                      placeholder="e.g. BR Esports"
                      className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Editor Mode Switcher */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 p-1 bg-black rounded-xl border border-neutral-800">
                    <button
                      onClick={() => setRuleEditMode('interactive')}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${
                        ruleEditMode === 'interactive' ? 'bg-purple-600 text-white' : 'text-neutral-500'
                      }`}
                    >
                      Interactive Builder ({ruleList.length})
                    </button>
                    <button
                      onClick={() => setRuleEditMode('raw')}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${
                        ruleEditMode === 'raw' ? 'bg-purple-600 text-white' : 'text-neutral-500'
                      }`}
                    >
                      Multi-line Text
                    </button>
                  </div>

                  {/* Preset Template Loaders */}
                  <div className="relative group">
                    <button className="text-[8px] font-black uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                      <Sparkles size={11} />
                      Load Preset
                    </button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl p-1.5 shadow-2xl z-20 w-48 space-y-1">
                      {Object.keys(RULE_PRESETS).map(pKey => (
                        <button
                          key={pKey}
                          onClick={() => handleApplyPresetTemplate(pKey)}
                          className="text-left px-3 py-2 rounded-lg text-[9px] font-bold text-neutral-300 hover:bg-purple-600 hover:text-white transition-colors"
                        >
                          {RULE_PRESETS[pKey].title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Interactive Builder Mode */}
                {ruleEditMode === 'interactive' ? (
                  <div className="space-y-3">
                    {/* Add Single Rule Input */}
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Add a new rule item (e.g. Device Requirement, Headshot Limit)..."
                        value={newSingleRuleText}
                        onChange={(e) => setNewSingleRuleText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSingleRule();
                          }
                        }}
                        className="flex-1 bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-medium text-white outline-none focus:border-purple-500 placeholder:text-neutral-600"
                      />
                      <button
                        onClick={handleAddSingleRule}
                        className="px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all"
                      >
                        Add
                      </button>
                    </div>

                    {/* Rule List Items */}
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 no-scrollbar">
                      {ruleList.length === 0 ? (
                        <div className="py-8 text-center bg-black/40 rounded-2xl border border-dashed border-neutral-800">
                          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">No rules in this section yet</p>
                          <p className="text-[8px] text-neutral-600 mt-1">Use the input above or load a starter preset</p>
                        </div>
                      ) : (
                        ruleList.map((r, idx) => (
                          <div key={idx} className="p-3.5 bg-black/60 border border-neutral-800/80 rounded-2xl flex items-start gap-3 group">
                            <span className="w-5 h-5 rounded-full bg-neutral-800 text-purple-400 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <input 
                                type="text"
                                value={r}
                                onChange={(e) => {
                                  const updated = [...ruleList];
                                  updated[idx] = e.target.value;
                                  setRuleList(updated);
                                  setRuleText(updated.join('\n'));
                                }}
                                className="w-full bg-transparent text-xs text-neutral-200 font-medium outline-none focus:text-white"
                              />
                            </div>
                            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                              <button 
                                onClick={() => handleMoveRule(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1 hover:text-purple-400 disabled:opacity-20"
                                title="Move Up"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button 
                                onClick={() => handleMoveRule(idx, 'down')}
                                disabled={idx === ruleList.length - 1}
                                className="p-1 hover:text-purple-400 disabled:opacity-20"
                                title="Move Down"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteSingleRule(idx)}
                                className="p-1 hover:text-red-400 text-neutral-500"
                                title="Delete Rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* Multi-line Raw Mode */
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">
                      Enter one rule per line ({ruleText.split('\n').filter(r => r.trim().length > 0).length} lines detected)
                    </p>
                    <textarea
                      value={ruleText}
                      onChange={(e) => {
                        setRuleText(e.target.value);
                        setRuleList(e.target.value.split('\n').filter(r => r.trim().length > 0));
                      }}
                      placeholder="Enter match rules here..."
                      className="w-full h-80 bg-black border border-neutral-800 rounded-2xl p-4 text-[11px] font-medium text-neutral-300 outline-none focus:border-purple-500 transition-all resize-none no-scrollbar leading-loose font-mono"
                    />
                  </div>
                )}

                {/* Save Regulations & Section Actions */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={handleSaveCurrentSectionRules}
                    disabled={isProcessing}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save "{activeSectionTitle}" Regulations
                  </button>

                  {!['battle_royale', 'clash_squad', 'lone_wolf'].includes(activeRuleTab) && (
                    <button
                      onClick={() => handleDeleteCustomSectionRules(activeRuleTab, activeSectionTitle)}
                      disabled={isProcessing}
                      className="w-full py-2.5 text-red-400 hover:text-red-300 text-[8px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Delete This Custom Section Rules
                    </button>
                  )}
                </div>
              </div>

              {/* Guidelines Info Banner */}
              <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl">
                 <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest leading-relaxed flex items-center gap-1.5">
                   <Sparkles size={12} />
                   Live Sync: Rules configured here are dynamically matched to user screens by Section and Mode name.
                 </p>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.REFERRAL && (
            <motion.div
              key="referral"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Referral Settings */}
              <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-6">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-sm font-black italic uppercase tracking-tight text-white">Referral Engine</h3>
                   <Copy size={16} className="text-purple-500" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Base Referral URL (e.g. https://fxarena.vercel.app)</label>
                    <input 
                      type="text"
                      placeholder="https://fxarena.in"
                      value={appSettings?.referral?.baseUrl || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, baseUrl: e.target.value }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">APK Download Link (Optional direct HTTPS URL)</label>
                    <input 
                      type="text"
                      placeholder="https://fxarena.in/FX-Arena.apk"
                      value={appSettings?.referral?.apkDownloadUrl || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, apkDownloadUrl: e.target.value }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Per Referral Reward (₹)</label>
                    <input 
                      type="number"
                      value={appSettings?.referral?.perReferralReward || 0}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, perReferralReward: Number(e.target.value) }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Reward Type</label>
                    <select 
                      value={appSettings?.referral?.rewardType || 'deposit'}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, rewardType: e.target.value }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 appearance-none shadow-none ring-0"
                    >
                      <option value="deposit">Deposit Only</option>
                      <option value="bonus">Bonus Only</option>
                      <option value="both">Both (Split)</option>
                    </select>
                  </div>

                  {appSettings?.referral?.rewardType === 'both' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Deposit %</label>
                        <input 
                          type="number"
                          value={appSettings?.referral?.depositPercentage || 50}
                          onChange={(e) => setAppSettings({
                            ...appSettings,
                            referral: { ...appSettings?.referral, depositPercentage: Number(e.target.value) }
                          })}
                          className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Bonus %</label>
                        <input 
                          type="number"
                          value={appSettings?.referral?.bonusPercentage || 50}
                          onChange={(e) => setAppSettings({
                            ...appSettings,
                            referral: { ...appSettings?.referral, bonusPercentage: Number(e.target.value) }
                          })}
                          className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">New User Reward (₹)</label>
                    <input 
                      type="number"
                      value={appSettings?.referral?.newUserReward || 0}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, newUserReward: Number(e.target.value) }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Referral configuration
                </button>
              </div>

              {/* Support Settings */}
              <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-6">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-sm font-black italic uppercase tracking-tight text-white">Customer support</h3>
                   <UsersIcon size={16} className="text-blue-500" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1">WhatsApp link</label>
                    <input 
                      type="text"
                      placeholder="https://wa.me/..."
                      value={appSettings?.support?.whatsapp || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, whatsapp: e.target.value }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1">Telegram link</label>
                    <input 
                      type="text"
                      placeholder="https://t.me/..."
                      value={appSettings?.support?.telegram || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, telegram: e.target.value }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1">support email</label>
                    <input 
                      type="email"
                      placeholder="support@example.com"
                      value={appSettings?.support?.email || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, email: e.target.value }
                      })}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Update support links
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.BANNERS && (
            <motion.div
              key="banners"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <button 
                onClick={() => {
                  setEditingBanner(null);
                  setImageUrl('');
                  setRedirectUrl('');
                  setBannerType('main');
                  setBannerOrder(banners.length);
                  setIsBannerModalOpen(true);
                }}
                className="w-full py-5 bg-purple-600 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-purple-600/20 active:scale-[0.98] transition-all"
              >
                <Plus size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Add Promotion Banner</span>
              </button>

              <div className="space-y-4">
                {banners.filter(b => b.isActive !== false).map((b) => (
                  <div key={b.id} className="p-4 bg-neutral-900 border border-neutral-800 rounded-3xl group">
                    <div className="relative aspect-video rounded-2xl overflow-hidden mb-4 border border-white/5">
                      <SafeImage 
                        src={b.imageUrl} 
                        alt="" 
                        className="w-full h-full"
                      />
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2 z-20">
                        <div className={`w-1.5 h-1.5 rounded-full ${b.type === 'main' || b.type === 'offer' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                        <span className="text-[8px] font-black uppercase text-white tracking-widest">{b.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[8px] font-black uppercase text-neutral-600 tracking-widest mb-1">Order: {b.order}</p>
                        {b.redirectUrl && <p className="text-[8px] font-black text-purple-400 truncate max-w-[150px]">{b.redirectUrl}</p>}
                      </div>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => {
                            setEditingBanner(b);
                            setImageUrl(b.imageUrl);
                            setRedirectUrl(b.redirectUrl || '');
                            setBannerType(b.type);
                            setBannerOrder(b.order);
                            setIsBannerModalOpen(true);
                          }}
                          className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl hover:bg-blue-500 hover:text-white transition-all"
                         >
                          <Edit2 size={16} />
                         </button>
                         <button 
                          onClick={() => handleDeleteBanner(b.id!)}
                          disabled={deletingBannerId === b.id}
                          className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                         >
                          {deletingBannerId === b.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                         </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.PAYMENT && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* UPI QR Scanner Upload & Config Section */}
              <div className="p-5 bg-neutral-900 border border-orange-500/30 rounded-3xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                      <QrCode size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black italic uppercase tracking-tight text-white">
                        UPI QR Scanner (Add Cash)
                      </h3>
                      <p className="text-[9px] font-bold text-neutral-400">
                        Shown to players when they tap Pay in Add Coins
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQrForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                    className={`w-12 h-6 rounded-full relative transition-all ${qrForm.isActive ? 'bg-orange-500' : 'bg-neutral-800'}`}
                    aria-label="Toggle QR Scanner"
                  >
                    <motion.div
                      className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-lg"
                      animate={{ x: qrForm.isActive ? 24 : 0 }}
                    />
                  </button>
                </div>

                {/* Amount Option Selector Tabs (Default + 15, 25, 50, 100, 200, 500, 1000) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                      Click Option to Upload QR Scanner
                    </label>
                    <span className="text-[9px] font-bold text-orange-400">
                      {selectedQrAmountKey === 'default' ? 'Default (All)' : `₹${selectedQrAmountKey} Selected`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {QR_AMOUNT_OPTIONS.map((opt) => {
                      const isSelected = selectedQrAmountKey === opt;
                      const hasQr = opt === 'default'
                        ? Boolean(qrForm.qrImageUrl?.trim())
                        : Boolean(qrForm.amountQrs?.[opt]?.trim());
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedQrAmountKey(opt)}
                          className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? 'bg-orange-500 border-orange-400 text-white shadow-md shadow-orange-500/20'
                              : 'bg-black/60 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                          }`}
                        >
                          <span>{opt === 'default' ? 'Default' : `₹${opt}`}</span>
                          {hasQr && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isSelected ? 'bg-white' : 'bg-emerald-400'
                              }`}
                              title="QR Uploaded"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preview & Upload Trigger */}
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/50 border border-neutral-800 rounded-2xl p-4">
                  <div className="w-32 h-32 rounded-xl bg-white p-1.5 border border-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
                    {activeQrUrl ? (
                      <img src={activeQrUrl} alt="Admin Payment QR" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center text-neutral-400 p-2">
                        <QrCode size={28} className="mx-auto mb-1 opacity-50" />
                        <span className="text-[9px] font-bold block">
                          {selectedQrAmountKey === 'default' ? 'No Default QR' : `No ₹${selectedQrAmountKey} QR`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 w-full space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                        {selectedQrAmountKey === 'default'
                          ? 'Default QR (Fallback for all amounts)'
                          : `₹${selectedQrAmountKey} Specific QR Scanner`}
                      </span>
                      {activeQrUrl && (
                        <button
                          type="button"
                          onClick={() => setActiveQrUrl('')}
                          className="text-[9px] font-black uppercase text-red-400 hover:text-red-300"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      ref={qrFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleQrImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingQr}
                      onClick={() => qrFileInputRef.current?.click()}
                      className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                    >
                      {isUploadingQr ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Uploading {qrUploadProgress}%...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          <span>
                            {selectedQrAmountKey === 'default'
                              ? 'Upload Default QR'
                              : `Upload ₹${selectedQrAmountKey} QR`}
                          </span>
                        </>
                      )}
                    </button>
                    <input
                      type="text"
                      value={activeQrUrl}
                      onChange={(e) => setActiveQrUrl(e.target.value)}
                      placeholder={
                        selectedQrAmountKey === 'default'
                          ? 'Or paste Default QR image URL...'
                          : `Or paste ₹${selectedQrAmountKey} QR image URL...`
                      }
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-neutral-600 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 block mb-1">
                      Merchant / Arena Name
                    </label>
                    <input
                      type="text"
                      value={qrForm.merchantName}
                      onChange={(e) => setQrForm(prev => ({ ...prev, merchantName: e.target.value }))}
                      placeholder="FX Arena eSport"
                      className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 block mb-1">
                      UPI ID (Optional Copy)
                    </label>
                    <input
                      type="text"
                      value={qrForm.upiId}
                      onChange={(e) => setQrForm(prev => ({ ...prev, upiId: e.target.value }))}
                      placeholder="e.g. yourname@okaxis"
                      className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {paymentFeedback && (
                  <div className={`p-3 rounded-2xl border flex items-start gap-2.5 text-xs font-bold ${
                    paymentFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}>
                    {paymentFeedback.type === 'success' ? (
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                    ) : (
                      <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                    )}
                    <p className="flex-1 leading-snug">{paymentFeedback.message}</p>
                    <button
                      type="button"
                      onClick={() => setPaymentFeedback(null)}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Dismiss"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isProcessing || isUploadingQr}
                  onClick={handleSaveQrSettings}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Save QR Scanner</span>
                </button>
              </div>

              {/* Add Cash Active Mode Status Banner */}
              {(() => {
                const activeAutoGw = paymentGateways.find(g => g.isActive && (g.apiKey || g.merchantId));
                const isManualQrMode = qrForm.isActive || !activeAutoGw;
                return (
                  <div className={`p-4 rounded-3xl border flex items-center justify-between gap-3 ${
                    isManualQrMode
                      ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-emerald-500/10 border-emerald-500/30'
                  }`}>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                        Active Add Coin Mode
                      </p>
                      <h4 className="text-xs font-black uppercase text-white mt-0.5 truncate">
                        {isManualQrMode
                          ? 'Manual QR Scanner (Admin Approves UTR)'
                          : `Automatic Gateway • ${activeAutoGw?.name} (Auto-Credit)`}
                      </h4>
                    </div>
                    {!isManualQrMode && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={async () => {
                          setIsProcessing(true);
                          try {
                            await setDoc(doc(db, 'appSettings', 'payment_qr'), {
                              isActive: true,
                              paymentQr: { ...qrForm, isActive: true },
                              updatedAt: serverTimestamp()
                            }, { merge: true });
                            setQrForm(prev => ({ ...prev, isActive: true }));
                          } finally {
                            setIsProcessing(false);
                          }
                        }}
                        className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider shrink-0"
                      >
                        Switch to QR
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="p-6 bg-purple-600/10 border border-purple-500/20 rounded-3xl flex items-center justify-between shadow-xl">
                 <div>
                   <h3 className="text-sm font-black italic uppercase tracking-tight text-white mb-1">Automatic Payment Gateways</h3>
                   <p className="text-[9px] font-bold text-purple-300/80">Add API Key anytime to enable auto coin credit</p>
                 </div>
                 <button 
                  onClick={() => openGatewayModal('', null)}
                  className="p-3 bg-purple-600 rounded-xl text-white active:scale-90 transition-all shadow-lg"
                  title="Add Custom Gateway"
                 >
                   <Plus size={20} />
                 </button>
              </div>

              <div className="space-y-4">
                {Array.from(new Set(['zapupi', 'cashfree', 'razorpay', 'transupi', 'custom', ...paymentGateways.map(g => g.id)])).map(gId => {
                  const gateway = paymentGateways.find(g => g.id === gId);
                  const hasKeys = Boolean(gateway && (gateway.apiKey || gateway.merchantId));
                  const isActive = Boolean(gateway?.isActive && !qrForm.isActive);

                  return (
                    <div key={gId} className={`p-5 bg-neutral-900 border rounded-3xl transition-all ${isActive ? 'border-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.1)]' : 'border-neutral-800'}`}>
                      <div className="flex items-center justify-between mb-4 gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${isActive ? 'bg-purple-600 border-purple-400 text-white' : 'bg-black border-neutral-800 text-neutral-600'}`}>
                            <DollarSign size={20} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-black italic uppercase tracking-tight truncate">{gateway?.name || gId.toUpperCase()}</h4>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className={`text-[8px] font-black uppercase tracking-widest ${hasKeys ? 'text-emerald-500' : 'text-neutral-500'}`}>
                                {hasKeys ? 'API Keys Added' : 'No API Key Yet'}
                              </span>
                              {hasKeys && (
                                <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                                  gateway?.isProduction
                                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                    : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                                }`}>
                                  {gateway?.isProduction ? 'Live' : 'Test'}
                                </span>
                              )}
                              {isActive && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">Active</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            type="button"
                            onClick={() => openGatewayModal(gId, gateway || null)}
                            className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-[9px] font-black uppercase tracking-wider text-white flex items-center gap-1.5 transition-colors"
                          >
                            <Key size={12} className="text-purple-400" />
                            <span>{hasKeys ? 'Edit Keys' : 'Add Keys'}</span>
                          </button>
                          <button 
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleToggleGateway(gId, Boolean(gateway?.isActive && !qrForm.isActive))}
                            className={`w-12 h-6 rounded-full relative transition-all ${isActive ? 'bg-purple-600' : 'bg-neutral-800'} ${!hasKeys ? 'opacity-40' : ''}`}
                            title={hasKeys ? 'Activate Automatic Gateway' : 'Add API keys first'}
                          >
                            <motion.div 
                              className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-lg"
                              animate={{ x: isActive ? 24 : 0 }}
                            />
                          </button>
                        </div>
                      </div>
                      
                      {hasKeys && (
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
                          <div>
                            <p className="text-[7px] font-black uppercase tracking-widest text-neutral-600">Merchant ID</p>
                            <p className="text-[9px] font-bold text-neutral-400 truncate">{gateway?.merchantId || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[7px] font-black uppercase tracking-widest text-neutral-600">API Key</p>
                            <p className="text-[9px] font-bold text-neutral-400 truncate">{gateway?.apiKey ? '••••••••' + gateway.apiKey.slice(-4) : 'N/A'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-lg bg-neutral-900 rounded-t-[3rem] p-8 pb-12 border-t border-neutral-800 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black italic">Manage User</h3>
                <button onClick={() => setSelectedUser(null)} className="p-2 text-neutral-500 text-2xl">&times;</button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-neutral-800">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600">Current Balance</p>
                    <p className="text-xl font-black italic text-emerald-400">
                      ₹{(selectedUser.wallet?.deposit || 0) + (selectedUser.wallet?.winnings || 0) + (selectedUser.wallet?.bonus || 0)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'deposit')}
                      className="p-3 bg-emerald-500 rounded-xl text-white shadow-lg shadow-emerald-500/20 active:scale-95"
                    >
                      <Plus size={18} />
                    </button>
                    <button 
                      onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'withdrawal')}
                      className="p-3 bg-red-500 rounded-xl text-white shadow-lg shadow-red-500/20 active:scale-95"
                    >
                      <Minus size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-neutral-800">
                  <div>
                    <h4 className="text-xs font-black italic mb-1">Account Safety</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600">
                      {selectedUser.isBanned ? 'User is Banned' : 'User is Active'}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleBanUser(selectedUser.id!, selectedUser.isBanned || false)}
                    className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border ${
                      selectedUser.isBanned 
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' 
                        : 'bg-red-500/10 border-red-500 text-red-500'
                    } transition-all active:scale-95`}
                  >
                    {selectedUser.isBanned ? <Unlock size={14} /> : <Ban size={14} />}
                    {selectedUser.isBanned ? 'Unban' : 'Ban User'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-neutral-800">
                  <div>
                    <h4 className="text-xs font-black italic mb-1">Password Management</h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600">Send Reset Link</p>
                  </div>
                  <button 
                    onClick={() => handleResetPassword(selectedUser.email)}
                    className="px-6 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-700 transition-all shadow-lg active:scale-95"
                  >
                    Reset Password
                  </button>
                </div>

                <div className="p-6 bg-black rounded-2xl border border-neutral-800">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4">Account Details</h4>
                   <div className="space-y-4">
                      <DetailRow label="Username" value={selectedUser.username} />
                      <DetailRow label="Email" value={selectedUser.email} />
                      <DetailRow label="Phone" value={selectedUser.phone || 'N/A'} />
                      <DetailRow label="Wallet" value={`₹${(selectedUser.wallet?.deposit || 0) + (selectedUser.wallet?.winnings || 0) + (selectedUser.wallet?.bonus || 0)}`} />
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen.isOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs bg-neutral-900 rounded-[2.5rem] p-8 border border-neutral-800 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-black italic mb-2">Delete Match?</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-8 leading-relaxed">
                This will delete the match and refund all joined players automatically.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' })}
                  className="py-4 bg-neutral-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={processDeleteMatch}
                  disabled={isProcessing}
                  className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Result Modal */}
      <AnimatePresence>
        {isResultModalOpen && selectedMatchResults && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-neutral-900 rounded-[2.5rem] p-8 border border-neutral-800 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                   <h3 className="text-lg font-black italic">Declare Result</h3>
                   <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mt-1">{selectedMatchResults.title}</p>
                </div>
                <button onClick={() => setIsResultModalOpen(false)} className="text-neutral-500 text-2xl">&times;</button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                <div className="bg-black/40 rounded-2xl p-4 border border-white/5 space-y-2">
                   <p className="text-[9px] font-black uppercase tracking-widest text-purple-500">Match Info</p>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] text-neutral-600 uppercase font-black">Type</p>
                        <p className="text-[10px] font-black text-white italic">
                          {selectedMatchResults.section === 'Battle Royale' 
                            ? (selectedMatchResults.prizeType === 'perKill' ? 'Per Kill' : 'Survival')
                            : selectedMatchResults.section}
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] text-neutral-600 uppercase font-black">Prize Pool</p>
                        <p className="text-[10px] font-black text-emerald-400 italic">
                          {selectedMatchResults.section === 'Battle Royale'
                            ? (selectedMatchResults.prizeType === 'perKill' ? `₹${selectedMatchResults.perKillAmount}/kill` : 'Split')
                            : `₹${selectedMatchResults.prizePool}`}
                        </p>
                      </div>
                   </div>
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between">
                     <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Enter Custom Winning Coins Per Player</p>
                     <span className="text-[9px] font-black text-emerald-400">
                       Total: ₹{(selectedMatchResults.players || []).reduce((sum, p) => {
                         const k = `${p.userId}_${p.slot}`;
                         return sum + Math.max(0, Number(playerWinningCoins[k] || 0) || 0);
                       }, 0)}
                     </span>
                   </div>
                   {selectedMatchResults.playersCount === 0 ? (
                     <div className="text-center py-10">
                        <UsersIcon size={32} className="mx-auto text-neutral-800 mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-700 italic">No players have joined this match</p>
                     </div>
                   ) : (
                     <div className="space-y-2.5">
                        {(selectedMatchResults.players || []).map(player => {
                            const playerKey = `${player.userId}_${player.slot}`;
                            const coinsValue = playerWinningCoins[playerKey] ?? '';
                            const numericCoins = Math.max(0, Number(coinsValue) || 0);
                            const killsOrRank = playerResults[playerKey] || 0;

                            return (
                              <div key={playerKey} className="p-4 bg-black/40 rounded-2xl border border-white/10 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div 
                                    onClick={() => {
                                      if (isFullAdmin) {
                                        onPageChange(Page.ADMIN_USER_PROFILE, player.userId);
                                      }
                                    }}
                                    className={`flex items-center gap-3 group ${isFullAdmin ? 'cursor-pointer' : ''}`}
                                  >
                                   <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 border border-white/5 font-black text-[10px]">
                                      #{player.slot || '?'}
                                   </div>
                                   <div>
                                     <h4 className="text-xs font-black italic group-hover:text-primary transition-colors leading-none mb-1 text-white">{player.ign || player.username}</h4>
                                     <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-widest">@{player.username}</p>
                                   </div>
                                </div>
                                {numericCoins > 0 && (
                                  <div className="text-right bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                                    <p className="text-xs font-black text-emerald-400 italic">+{numericCoins} Coins</p>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-emerald-400 ml-1">
                                    Winning Coins (₹) *
                                  </label>
                                  <input 
                                    type="number"
                                    min="0"
                                    placeholder="e.g. 25 or 15"
                                    value={coinsValue}
                                    onChange={(e) => setPlayerWinningCoins({ ...playerWinningCoins, [playerKey]: e.target.value })}
                                    className="w-full bg-neutral-800 border border-emerald-500/40 rounded-xl px-3 py-2.5 text-xs font-black text-emerald-300 focus:border-emerald-400 outline-none placeholder:text-neutral-600"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-widest text-neutral-500 ml-1">
                                    {selectedMatchResults.prizeType === 'perKill' ? 'Kills (Optional)' : 'Rank (Optional)'}
                                  </label>
                                  <input 
                                    type="number"
                                    min="0"
                                    placeholder="Optional"
                                    value={killsOrRank || ''}
                                    onChange={(e) => setPlayerResults({ ...playerResults, [playerKey]: Number(e.target.value) })}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:border-purple-500 outline-none placeholder:text-neutral-600"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                     </div>
                   )}
                </div>
              </div>

              <button 
                type="button"
                onClick={handleSubmitResult}
                disabled={isProcessing || selectedMatchResults.playersCount === 0}
                className="w-full mt-6 py-5 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Credit Coins & Declare Results'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Banner Management Modal */}
      <AnimatePresence>
        {isBannerModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-neutral-900 rounded-[2.5rem] p-8 border border-neutral-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-black italic">{editingBanner ? 'Edit Banner' : 'New Banner'}</h3>
                <button onClick={() => setIsBannerModalOpen(false)} className="text-neutral-500 text-2xl transition-colors hover:text-white">&times;</button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Banner Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {['main', 'offer', 'freefire'].map(t => (
                      <button
                        key={t}
                        onClick={() => {
                          setBannerType(t as any);
                          // Reset image when type changes if it's not a fresh upload? No, keep it.
                        }}
                        className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                          bannerType === t 
                            ? 'bg-purple-600 border-purple-500 text-white' 
                            : 'bg-black border-neutral-800 text-neutral-500'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Banner Image</label>
                  
                  {imageUrl ? (
                    <div className="relative group aspect-video rounded-2xl overflow-hidden border border-neutral-800 bg-black">
                      <SafeImage 
                        src={imageUrl} 
                        alt="Preview" 
                        className="w-full h-full"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all z-20">
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase rounded-lg shadow-xl active:scale-95 transition-all"
                        >
                          Change Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full aspect-video rounded-3xl border-2 border-dashed border-neutral-800 flex flex-col items-center justify-center gap-3 hover:border-purple-500/50 hover:bg-neutral-900/50 transition-all group"
                    >
                      {isUploading ? (
                        <Loader2 size={32} className="text-purple-500 animate-spin" />
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-neutral-900 flex items-center justify-center text-neutral-500 group-hover:text-purple-500 transition-colors">
                            <Upload size={24} />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 group-hover:text-neutral-400">Upload Banner Image</p>
                        </>
                      )}
                    </button>
                  )}
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-purple-400">UPLOADING...</span>
                        <span className="text-[8px] font-black text-purple-400">{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-black rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className="h-full bg-purple-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {(bannerType === 'main' || bannerType === 'offer') && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Redirect Link (Optional)</label>
                    <input 
                      type="text"
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Display Order</label>
                  <input 
                    type="number"
                    value={bannerOrder}
                    onChange={(e) => setBannerOrder(Number(e.target.value))}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500"
                  />
                </div>

                <button 
                  onClick={handleSaveBanner}
                  disabled={isProcessing || isUploading || !imageUrl}
                  className="w-full py-5 bg-purple-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-3 active:scale-95 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : isUploading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isUploading ? 'Uploading Image...' : editingBanner ? 'Update Promotion' : 'Publish Banner'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Gateway Modal */}
      <AnimatePresence>
        {isGatewayModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-neutral-900 rounded-[2.5rem] p-7 border border-neutral-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black italic">
                    {gatewayForm.id ? `${gatewayForm.name || gatewayForm.id.toUpperCase()} API Keys` : 'Add Automatic Gateway'}
                  </h3>
                  <p className="text-[9px] font-bold text-neutral-400">
                    Paste your merchant credentials for automatic coin credit
                  </p>
                </div>
                <button onClick={() => setIsGatewayModalOpen(false)} className="text-neutral-500 text-2xl transition-colors hover:text-white">&times;</button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Gateway Name</label>
                  <input 
                    type="text"
                    value={gatewayForm.name}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })}
                    placeholder="ZapUPI, Cashfree PG, Razorpay, etc."
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                {/* Test / Live Environment Toggle */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Environment Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGatewayForm({ ...gatewayForm, isProduction: false })}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        !gatewayForm.isProduction
                          ? 'bg-blue-500/15 border-blue-500 text-blue-300'
                          : 'bg-black border-neutral-800 text-neutral-500'
                      }`}
                    >
                      Test / Sandbox
                    </button>
                    <button
                      type="button"
                      onClick={() => setGatewayForm({ ...gatewayForm, isProduction: true })}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        gatewayForm.isProduction
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                          : 'bg-black border-neutral-800 text-neutral-500'
                      }`}
                    >
                      Live / Production
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Merchant ID (Optional)</label>
                    <input 
                      type="text"
                      value={gatewayForm.merchantId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, merchantId: e.target.value })}
                      placeholder="MID_123..."
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">UPI ID (Optional)</label>
                    <input 
                      type="text"
                      value={gatewayForm.upiId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, upiId: e.target.value })}
                      placeholder="merchant@upi"
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">
                    {gatewayForm.id === 'cashfree' ? 'Client ID / API Key *' : 'API Key / Token *'}
                  </label>
                  <input 
                    type="password"
                    value={gatewayForm.apiKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, apiKey: e.target.value })}
                    placeholder={gatewayForm.id === 'zapupi' ? 'Paste ZapUPI API Key' : 'Enter Public API Key / Client ID'}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">
                    {gatewayForm.id === 'cashfree' ? 'Client Secret *' : 'Secret Key (If required)'}
                  </label>
                  <input 
                    type="password"
                    value={gatewayForm.secretKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, secretKey: e.target.value })}
                    placeholder="Enter Secret Key"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 ml-1">Webhook Secret (Optional)</label>
                  <input 
                    type="password"
                    value={gatewayForm.webhookSecret}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, webhookSecret: e.target.value })}
                    placeholder="Enter Webhook Secret"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                {/* Webhook Callback URL to paste into Gateway Dashboard */}
                {(() => {
                  const gwSlug = (gatewayForm.id || gatewayForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'zapupi');
                  const webhookUrl = `${window.location.origin}/api/${gwSlug}/webhook`;
                  return (
                    <div className="bg-black/60 border border-neutral-800 rounded-2xl p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">
                          Webhook URL (Paste in Gateway Dashboard)
                        </p>
                        <p className="text-[10px] font-mono text-purple-300 truncate select-all mt-0.5">
                          {webhookUrl}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyCredential(webhookUrl, 'gw_webhook')}
                        className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-white flex items-center gap-1 shrink-0"
                      >
                        {copiedKey === 'gw_webhook' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedKey === 'gw_webhook' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  );
                })()}

                {paymentFeedback && paymentFeedback.type === 'error' && (
                  <div className="p-3 rounded-2xl border bg-red-500/10 border-red-500/30 text-red-300 flex items-start gap-2.5 text-xs font-bold">
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                    <p className="flex-1 leading-snug">{paymentFeedback.message}</p>
                  </div>
                )}

                <div className="pt-2">
                  <button 
                    onClick={handleSaveGateway}
                    disabled={isProcessing}
                    className="w-full py-4 bg-purple-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>Save API Credentials</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Room Credentials Modal */}
      <AnimatePresence>
        {isDeclareRoomModalOpen && selectedDeclareRoomMatch && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[75] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-7 shadow-2xl overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase text-white tracking-wide">
                      Declare Room Credentials
                    </h3>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">
                      Match: {selectedDeclareRoomMatch.displayId || selectedDeclareRoomMatch.id.slice(0, 6)} • {selectedDeclareRoomMatch.title}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDeclareRoomModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 py-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Custom Room ID *
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={declareRoomForm.roomId}
                      onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomId: e.target.value })}
                      placeholder="e.g. 19284752"
                      className="w-full bg-black border border-neutral-800 rounded-2xl px-4 py-3.5 text-sm font-bold font-mono text-white outline-none focus:border-purple-500 transition-all placeholder:text-neutral-600"
                    />
                    {declareRoomForm.roomId && (
                      <button
                        onClick={() => handleCopyCredential(declareRoomForm.roomId, 'modal_room')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white"
                      >
                        {copiedKey === 'modal_room' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Room Password *
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={declareRoomForm.roomPassword}
                      onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomPassword: e.target.value })}
                      placeholder="e.g. 1234 or freefire"
                      className="w-full bg-black border border-neutral-800 rounded-2xl px-4 py-3.5 text-sm font-bold font-mono text-white outline-none focus:border-purple-500 transition-all placeholder:text-neutral-600"
                    />
                    {declareRoomForm.roomPassword && (
                      <button
                        onClick={() => handleCopyCredential(declareRoomForm.roomPassword, 'modal_pass')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white"
                      >
                        {copiedKey === 'modal_pass' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Match Status Transition
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeclareRoomForm({ ...declareRoomForm, setStatusLive: true })}
                      className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        declareRoomForm.setStatusLive
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-black border-neutral-800 text-neutral-500'
                      }`}
                    >
                      ⚡ Mark Live / Ongoing
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeclareRoomForm({ ...declareRoomForm, setStatusLive: false })}
                      className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                        !declareRoomForm.setStatusLive
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                          : 'bg-black border-neutral-800 text-neutral-500'
                      }`}
                    >
                      🕒 Keep Existing Status
                    </button>
                  </div>
                </div>

                {/* Auto Push Notification Toggle */}
                <div 
                  onClick={() => setDeclareRoomForm({ 
                    ...declareRoomForm, 
                    sendNotificationOnRoomDeclare: !declareRoomForm.sendNotificationOnRoomDeclare 
                  })}
                  className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                    declareRoomForm.sendNotificationOnRoomDeclare 
                      ? 'bg-purple-600/20 border-purple-500/50' 
                      : 'bg-black border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      declareRoomForm.sendNotificationOnRoomDeclare 
                        ? 'bg-purple-500 text-white' 
                        : 'bg-neutral-800 text-neutral-500'
                    }`}>
                      <Bell size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-white">
                        Auto Push Notification
                      </p>
                      <p className="text-[8px] text-neutral-400 font-medium">
                        Instantly alert joined players with Room ID & Pass
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    declareRoomForm.sendNotificationOnRoomDeclare 
                      ? 'bg-purple-600 border-purple-500 text-white' 
                      : 'border-neutral-700 bg-neutral-900'
                  }`}>
                    {declareRoomForm.sendNotificationOnRoomDeclare && <Check size={12} />}
                  </div>
                </div>

                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                  <p className="text-[8px] font-bold text-purple-300 leading-relaxed">
                    💡 Once declared, players who joined this match will immediately see Room ID & Password on their Match Details screen and in their My Matches lobby.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSaveDeclareRoom}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Publish Room Credentials
                </button>

                {(matchCredentialsMap[selectedDeclareRoomMatch.id]?.roomId || selectedDeclareRoomMatch.roomId || selectedDeclareRoomMatch.roomPassword) && (
                  <button
                    type="button"
                    onClick={() => handleClearRoomCredentials(selectedDeclareRoomMatch.id)}
                    disabled={isProcessing}
                    className="w-full py-2.5 text-neutral-500 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear Credentials
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Game Mode Section Rules Modal */}
      <AnimatePresence>
        {isAddSectionModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[75] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-7 shadow-2xl overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black italic uppercase text-white tracking-wide">
                      Create Mode Section Rules
                    </h3>
                    <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">
                      Add a new game section with tailored rules
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAddSectionModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 py-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Section Name / Game Mode *
                  </label>
                  <input 
                    type="text"
                    value={newSectionForm.title}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, title: e.target.value })}
                    placeholder="e.g. Clash Squad 2v2, Lone Wolf Pro, Daily Scrims"
                    className="w-full bg-black border border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-white outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Category Tag
                  </label>
                  <input 
                    type="text"
                    value={newSectionForm.category}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, category: e.target.value })}
                    placeholder="e.g. Custom Tournament, Duo Scrims"
                    className="w-full bg-black border border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-white outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">
                    Initial Rules Preset
                  </label>
                  <select
                    value={newSectionForm.template}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, template: e.target.value })}
                    className="w-full bg-black border border-neutral-800 rounded-2xl px-4 py-3.5 text-xs font-bold text-white outline-none focus:border-purple-500 transition-all"
                  >
                    {Object.keys(RULE_PRESETS).map((pKey) => (
                      <option key={pKey} value={pKey}>
                        {RULE_PRESETS[pKey].title} ({RULE_PRESETS[pKey].rules.length} rules)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleAddNewSectionSubmit}
                  disabled={isProcessing}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                  Create Section & Rules
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between h-32 relative overflow-hidden group">
      <Icon size={48} className={`absolute -right-2 -bottom-2 opacity-10 ${color} group-hover:scale-110 transition-transform`} />
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 relative z-10">{label}</p>
      <p className="text-2xl font-black italic tracking-tighter truncate relative z-10">{value}</p>
    </div>
  );
}

function HealthBar({ label, status }: any) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{status}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: any) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-white/5">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">{label}</span>
      <span className="text-[10px] font-bold text-neutral-300">{value}</span>
    </div>
  );
}

