import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Download,
  ShieldCheck,
  Trophy,
  Zap,
  Smartphone,
  LogIn,
  UserPlus,
  Headphones,
  CheckCircle2,
  Gamepad2,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { APP_LOGO_URL, WELCOME_SPLASH_URL } from '../utils/assetUrl';

const ENV_APK_URL = (import.meta.env.VITE_APK_DOWNLOAD_URL || '').trim();

interface DownloadAppProps {
  isLoggedIn?: boolean;
}

export default function DownloadApp({ isLoggedIn = false }: DownloadAppProps) {
  const [apkUrl, setApkUrl] = useState<string>(ENV_APK_URL);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  useEffect(() => {
    // Authenticated users can also receive a dynamically configured APK URL from Firestore
    if (!auth.currentUser) return;
    getDoc(doc(db, 'appSettings', 'referral_support'))
      .then((snap) => {
        if (snap.exists()) {
          const customUrl = (snap.data()?.referral?.apkDownloadUrl || '').trim();
          if (customUrl && !customUrl.includes('localhost')) {
            setApkUrl(customUrl);
          }
        }
      })
      .catch(() => {
        // Ignore gracefully; env APK URL remains active
      });
  }, [isLoggedIn]);

  const handleApkDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!apkUrl) {
      e.preventDefault();
      setDownloadNote(
        'Official APK release link is being prepared. You can create your account or log in directly on Web right now!'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#050814] text-white selection:bg-purple-500/30 pb-16">
      {/* Top Public Header (No Admin Links) */}
      <header className="sticky top-0 z-30 bg-[#050814]/85 backdrop-blur-md border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={APP_LOGO_URL}
              alt="FX Arena Esports Logo"
              className="w-10 h-10 rounded-xl object-cover border border-white/15 shadow-lg shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-tight text-white truncate">
                FX Arena <span className="text-purple-400">Esports</span>
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Official Android App
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={isLoggedIn ? '/home' : '/login'}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-purple-600/25"
            >
              <LogIn size={14} />
              <span>{isLoggedIn ? 'Open App' : 'Login'}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#131d3b] via-[#0c1226] to-[#080b18] border border-white/10 p-6 shadow-2xl"
        >
          <div className="absolute -top-20 -right-16 w-56 h-56 bg-purple-600/20 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-20 -left-16 w-56 h-56 bg-red-600/15 blur-3xl rounded-full pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <img
              src={APP_LOGO_URL}
              alt="FX Arena Esports Official Icon"
              className="w-24 h-24 rounded-3xl object-cover border-2 border-purple-400/40 shadow-2xl mb-4"
            />

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-widest mb-3">
              <ShieldCheck size={12} /> Verified Android APK • Free Download
            </span>

            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight text-white">
              FX Arena <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-300">Esports</span>
            </h1>

            <p className="mt-2.5 text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-sm">
              Daily Free Fire Battle Royale, Clash Squad &amp; Lone Wolf custom room tournaments. Join rooms, compete fairly, and win instant rewards.
            </p>

            {/* Primary Download APK CTA */}
            <div className="w-full mt-6 space-y-3">
              <a
                href={apkUrl || '#download-unavailable'}
                onClick={handleApkDownloadClick}
                download="FX-Arena-Esports.apk"
                rel="noopener noreferrer"
                className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-purple-600/30 active:scale-[0.98] transition-all"
              >
                <Download size={18} />
                <span>Download Official Android APK</span>
              </a>

              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  to={isLoggedIn ? '/home' : '/login'}
                  className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                >
                  <LogIn size={14} />
                  <span>{isLoggedIn ? 'Go to Home' : 'Web Login'}</span>
                </Link>
                <Link
                  to={isLoggedIn ? '/tournaments' : '/signup'}
                  className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-purple-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                >
                  <UserPlus size={14} />
                  <span>{isLoggedIn ? 'Tournaments' : 'Create Account'}</span>
                </Link>
              </div>
            </div>

            {downloadNote && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] font-medium leading-relaxed">
                {downloadNote}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-white/10 w-full grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs font-black text-white">Android 7+</p>
                <p className="text-[10px] text-neutral-400">Platform</p>
              </div>
              <div>
                <p className="text-xs font-black text-emerald-400">Free</p>
                <p className="text-[10px] text-neutral-400">App Download</p>
              </div>
              <div>
                <p className="text-xs font-black text-amber-300">24/7</p>
                <p className="text-[10px] text-neutral-400">Custom Rooms</p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Preview Banner */}
        <section className="rounded-3xl overflow-hidden border border-white/10 bg-[#0b1020] shadow-xl">
          <img
            src={WELCOME_SPLASH_URL}
            alt="FX Arena Esports Tournament Poster"
            className="w-full max-h-80 object-cover object-top"
            loading="lazy"
          />
        </section>

        {/* Key Features for Players & Search Engines */}
        <section aria-labelledby="features-heading" className="space-y-3">
          <h2 id="features-heading" className="text-xs font-black uppercase tracking-widest text-neutral-400 px-1">
            Why Players Choose FX Arena Esports
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <article className="p-4 rounded-2xl bg-[#0e1428] border border-white/10 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Trophy size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white">Daily Tournaments</h3>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                BR Solo, Duo, Squad, Clash Squad 4v4, and Lone Wolf 1v1 custom rooms every day.
              </p>
            </article>

            <article className="p-4 rounded-2xl bg-[#0e1428] border border-white/10 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <Zap size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white">Instant Rewards</h3>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Per-kill &amp; rank prize pools credited directly to your secure in-app wallet.
              </p>
            </article>

            <article className="p-4 rounded-2xl bg-[#0e1428] border border-white/10 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white">Fair Play Arena</h3>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Verified Room ID &amp; Password delivery and strict anti-cheat tournament monitoring.
              </p>
            </article>

            <article className="p-4 rounded-2xl bg-[#0e1428] border border-white/10 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                <Headphones size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white">24/7 Player Support</h3>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Fast assistance via in-app support, WhatsApp, and Telegram community channels.
              </p>
            </article>
          </div>
        </section>

        {/* How to Install APK Guide */}
        <section aria-labelledby="install-guide-heading" className="p-5 rounded-3xl bg-[#0e1428] border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-purple-400" />
            <h2 id="install-guide-heading" className="text-xs font-black uppercase tracking-wider text-white">
              How to Install FX Arena Esports APK on Android
            </h2>
          </div>

          <ol className="space-y-2.5 text-xs text-neutral-300">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>Tap <strong>Download Official Android APK</strong> above to save <code>FX-Arena-Esports.apk</code>.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>Open the downloaded file and allow <strong>Install from this source</strong> if Android asks.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>Launch FX Arena Esports, register your Free Fire profile, and join your first custom room.</span>
            </li>
          </ol>
        </section>

        {/* FAQ Section for Rich Search Results */}
        <section aria-labelledby="faq-heading" className="p-5 rounded-3xl bg-[#0b1020] border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <HelpCircle size={16} className="text-amber-400" />
            <h2 id="faq-heading" className="text-xs font-black uppercase tracking-wider text-white">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <h3 className="font-bold text-white">Is FX Arena Esports free to download?</h3>
              <p className="text-neutral-400 mt-0.5">
                Yes, downloading the FX Arena Esports Android app and creating a player account is 100% free.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white">Can I play without installing the APK?</h3>
              <p className="text-neutral-400 mt-0.5">
                Yes, you can register and use the full player experience directly in your browser using Web Login.
              </p>
            </div>
          </div>

          <Link
            to={isLoggedIn ? '/home' : '/signup'}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-purple-400 hover:text-purple-300"
          >
            <Gamepad2 size={14} />
            <span>{isLoggedIn ? 'Enter Tournament Arena' : 'Register as a Player Now'}</span>
            <ArrowRight size={14} />
          </Link>
        </section>

        <footer className="text-center pt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          FX Arena Esports • Official Player Portal &amp; APK Download
        </footer>
      </main>
    </div>
  );
}
