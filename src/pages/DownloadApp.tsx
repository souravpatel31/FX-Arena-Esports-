import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Download,
  Share2,
  Copy,
  CheckCircle2,
  Trophy,
  Zap,
  Key,
  ShieldCheck,
  Smartphone,
  ArrowLeft,
  ArrowRight,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { APP_LOGO_URL } from '../utils/assetUrl';
import { buildAppSharePayload, getCleanPublicOrigin, getDownloadButtonHref } from '../utils/shareLinks';

interface DownloadAppProps {
  isLoggedIn?: boolean;
}

export default function DownloadApp({ isLoggedIn = false }: DownloadAppProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refCode = (searchParams.get('ref') || '').trim();

  const [appSettings, setAppSettings] = useState<any>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  useEffect(() => {
    const origin = getCleanPublicOrigin(appSettings);
    const prevTitle = document.title;
    document.title = 'Download FX Arena eSport APK – Official Android App';
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const prevCanonical = canonicalEl?.getAttribute('href') || '';
    if (canonicalEl) {
      canonicalEl.setAttribute('href', `${origin}/download`);
    }
    return () => {
      document.title = prevTitle;
      if (canonicalEl && prevCanonical) {
        canonicalEl.setAttribute('href', prevCanonical);
      }
    };
  }, [appSettings]);

  useEffect(() => {
    if (!auth.currentUser) return;
    getDoc(doc(db, 'appSettings', 'referral_support'))
      .then((snap) => {
        if (snap.exists()) {
          setAppSettings(snap.data());
        }
      })
      .catch(() => {});
  }, [isLoggedIn]);

  const { href: downloadHref, isReady } = getDownloadButtonHref(appSettings);
  const sharePayload = buildAppSharePayload(appSettings, refCode || undefined);

  const handleApkDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isReady || !downloadHref) {
      e.preventDefault();
      setDownloadNote('APK link is currently updating. Please try again shortly.');
    }
  };

  const handleCopyCleanLink = async () => {
    try {
      await navigator.clipboard.writeText(sharePayload.copyText);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = sharePayload.copyText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setShareToast('App link copied!');
    setTimeout(() => setShareToast(null), 2500);
  };

  const handleShareApp = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: sharePayload.title,
          url: sharePayload.url,
          dialogTitle: sharePayload.title,
        });
        return;
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('cancel') || err?.name === 'AbortError') return;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: sharePayload.title,
          url: sharePayload.url,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    await handleCopyCleanLink();
  };

  const signupPath = refCode ? `/signup?ref=${encodeURIComponent(refCode)}` : '/signup';
  const loginPath = refCode ? `/login?ref=${encodeURIComponent(refCode)}` : '/login';

  return (
    <div className="min-h-screen bg-[#050814] text-white px-4 py-8 pb-16">
      <main className="w-full max-w-md mx-auto space-y-5">
        {isLoggedIn && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors"
            >
              <ArrowLeft size={15} />
              <span>Back to Settings</span>
            </button>
          </div>
        )}

        {/* Primary Hero Download Card */}
        <section className="rounded-3xl bg-gradient-to-b from-[#111936] to-[#0b1022] border border-white/10 p-6 text-center shadow-2xl space-y-5">
          <div className="relative inline-block">
            <img
              src={APP_LOGO_URL}
              alt="FX Arena eSport"
              className="w-24 h-24 rounded-3xl object-cover mx-auto border border-white/15 shadow-xl"
            />
            <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest text-emerald-300">
              <ShieldCheck size={12} />
              Official Android App
            </span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              FX Arena eSport
            </h1>
            <p className="text-xs text-slate-300 font-medium leading-relaxed">
              Daily Free Fire Custom Room Tournaments, Instant Room ID &amp; Password Alerts, and Fast Wallet Withdrawals.
            </p>
          </div>

          {refCode && (
            <div className="px-3.5 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-xs font-bold text-purple-200">
              Invited by <span className="text-white font-black">@{refCode}</span> — Download &amp; Signup to claim your bonus!
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <a
              href={downloadHref || '#download'}
              onClick={handleApkDownloadClick}
              download="FX-Arena.apk"
              rel="noopener noreferrer"
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-purple-600/30 active:scale-[0.98] transition-all"
            >
              <Download size={18} />
              <span>Download APK</span>
            </a>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleShareApp}
                className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <Share2 size={15} className="text-purple-300" />
                <span>Share App</span>
              </button>
              <button
                type="button"
                onClick={handleCopyCleanLink}
                className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-wider text-slate-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <Copy size={15} className="text-emerald-300" />
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          {shareToast && (
            <div className="py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} />
              <span>{shareToast}</span>
            </div>
          )}

          {downloadNote && (
            <p className="text-xs text-amber-300 font-medium">{downloadNote}</p>
          )}
        </section>

        {/* Feature Text Cards */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#0c1226] border border-white/10 p-4 space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Trophy size={16} />
            </div>
            <h2 className="text-xs font-black uppercase tracking-wide text-white">
              Daily Tournaments
            </h2>
            <p className="text-[11px] text-slate-400 leading-snug">
              Join Battle Royale, Clash Squad, &amp; Lone Wolf matches and win real coins.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0c1226] border border-white/10 p-4 space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Key size={16} />
            </div>
            <h2 className="text-xs font-black uppercase tracking-wide text-white">
              Private Room IDP
            </h2>
            <p className="text-[11px] text-slate-400 leading-snug">
              Room ID &amp; Password alerts sent securely only to joined match players.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0c1226] border border-white/10 p-4 space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Zap size={16} />
            </div>
            <h2 className="text-xs font-black uppercase tracking-wide text-white">
              Fast Payouts
            </h2>
            <p className="text-[11px] text-slate-400 leading-snug">
              Instant prize coin credit after result declaration &amp; easy UPI withdrawals.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0c1226] border border-white/10 p-4 space-y-1.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <ShieldCheck size={16} />
            </div>
            <h2 className="text-xs font-black uppercase tracking-wide text-white">
              100% Fair Play
            </h2>
            <p className="text-[11px] text-slate-400 leading-snug">
              Strict anti-hack &amp; mobile-only verification across every custom room.
            </p>
          </div>
        </section>

        {/* How to Install Card */}
        <section className="rounded-3xl bg-[#0c1226] border border-white/10 p-5 space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
              <Smartphone size={16} />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-white">
                How to Install on Android
              </h2>
              <p className="text-[10px] text-slate-400">Simple 3-step installation guide</p>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <span className="w-6 h-6 rounded-lg bg-purple-600/25 text-purple-300 text-xs font-black flex items-center justify-center shrink-0">
                1
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tap <span className="text-white font-bold">Download APK</span> above to save{' '}
                <span className="text-white font-semibold">FX-Arena.apk</span> on your phone.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <span className="w-6 h-6 rounded-lg bg-purple-600/25 text-purple-300 text-xs font-black flex items-center justify-center shrink-0">
                2
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Open the downloaded APK file and allow <span className="text-white font-bold">Install from Unknown Sources</span> if prompted.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <span className="w-6 h-6 rounded-lg bg-purple-600/25 text-purple-300 text-xs font-black flex items-center justify-center shrink-0">
                3
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Launch <span className="text-white font-bold">FX Arena eSport</span>, create your account, and start playing!
              </p>
            </div>
          </div>
        </section>

        {/* Web Login / Signup Actions */}
        {!isLoggedIn && (
          <section className="rounded-3xl bg-[#0c1226] border border-white/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wider text-slate-300">
                Play Directly on Web
              </p>
              <ArrowRight size={14} className="text-slate-500" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                to={loginPath}
                className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn size={15} />
                <span>Login</span>
              </Link>
              <Link
                to={signupPath}
                className="py-3 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus size={15} />
                <span>Register</span>
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
