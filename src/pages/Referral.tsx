import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Gift, Share2, Copy, CheckCircle2, Award, Trophy } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Page, User } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { buildAppSharePayload } from '../utils/shareLinks';

interface ReferralPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ReferralPage({ user, onPageChange }: ReferralPageProps) {
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists()) {
        setAppSettings(snap.data());
      }
    });
    return () => unsub();
  }, []);

  const referralCode = user.username;
  const sharePayload = buildAppSharePayload(appSettings, referralCode);

  const handleCopy = async (text: string, feedbackMsg = 'Copied to clipboard!') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setShareFeedback(feedbackMsg);
    setTimeout(() => {
      setCopied(false);
      setShareFeedback(null);
    }, 2500);
  };

  const rawRefReward = appSettings?.referral?.perReferralReward;
  const refReward = rawRefReward === undefined || rawRefReward === 50 ? 3 : rawRefReward;
  const rewardType = appSettings?.referral?.rewardType || 'bonus';
  const rawNewUserReward = appSettings?.referral?.newUserReward;
  const newUserReward = rawNewUserReward === undefined || rawNewUserReward === 10 ? 2 : rawNewUserReward;

  const handleShare = async () => {
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

    await handleCopy(sharePayload.copyText, 'App link copied!');
  };

  return (
    <div className="pb-24 max-w-lg mx-auto bg-background min-h-screen">
      <div className="px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => onPageChange(Page.PROFILE)}
            className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-white leading-none">
              Refer & <span className="text-purple-500">Earn</span>
            </h2>
            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mt-1">Unlimited Rewards Program</p>
          </div>
        </div>

        {/* Hero Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden p-8 rounded-[2.5rem] bg-gradient-to-br from-purple-600 to-indigo-700 shadow-2xl shadow-purple-900/20 mb-8"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Gift size={120} />
          </div>
          <div className="relative z-10">
             <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md">
                <Gift className="text-white" size={24} />
             </div>
             <h3 className="text-2xl font-black italic text-white uppercase leading-[0.9] mb-4">
                Invite Friends,<br />
                Get ₹{refReward} Rewards
             </h3>
             <p className="text-[10px] font-bold text-purple-100 uppercase tracking-widest opacity-80 leading-relaxed mb-6">
                Spread the word and build your gaming squad. You get ₹{refReward} {rewardType === 'both' ? 'split' : rewardType} for every friend who joins.
             </p>
             <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-black/30 rounded-lg backdrop-blur-md border border-white/10">
                   <span className="text-[12px] font-black text-white italic">{referralCode}</span>
                </div>
                <button 
                   onClick={() => handleCopy(referralCode)}
                   className="p-2 bg-white rounded-lg text-purple-600 active:scale-90 transition-transform"
                >
                   {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                </button>
             </div>
          </div>
        </motion.div>

        {/* How it works */}
        <section className="space-y-4 mb-8">
           <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">How it works</h4>
           <div className="grid grid-cols-1 gap-3">
              <Step 
                num="01" 
                title="Share your link" 
                desc="Send your unique referral link to your friends or squad members." 
                icon={Share2}
              />
              <Step 
                num="02" 
                title="Friend Registers" 
                desc={`They get ₹${newUserReward} instant bonus when they sign up using your link.`} 
                icon={Users}
              />
              <Step 
                num="03" 
                title="Earn Together" 
                desc={`You receive ₹${refReward} reward instantly in your wallet.`} 
                icon={Award}
              />
           </div>
        </section>

        {/* Share Button */}
        <button 
           onClick={handleShare}
           className="w-full py-5 bg-white text-black rounded-3xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-white/5 active:scale-95 transition-all mb-4"
        >
           <Share2 size={20} />
           Share App &amp; Referral
        </button>

        {shareFeedback && (
          <div className="mb-6 py-2.5 px-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-center text-[11px] font-black uppercase tracking-wider text-emerald-400">
            {shareFeedback}
          </div>
        )}

        {/* Info Card */}
        <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl border-dashed">
           <div className="flex items-center gap-3 mb-4">
              <Trophy size={20} className="text-amber-500" />
              <h4 className="text-[11px] font-black uppercase tracking-tight text-white italic">Program Guidelines</h4>
           </div>
           <ul className="space-y-3">
              {[
                'One device allowed per referral',
                'Referee must be a new user',
                'Rewards are credited instantly',
                'No limit on number of referrals'
              ].map((rule, idx) => (
                <li key={idx} className="flex items-center gap-3 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                   <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                   {rule}
                </li>
              ))}
           </ul>
        </div>
      </div>
    </div>
  );
}

function Step({ num, title, desc, icon: Icon }: any) {
  return (
    <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-3xl flex gap-5">
       <div className="flex flex-col items-center gap-2">
          <span className="text-[12px] font-black text-purple-500 italic">{num}</span>
          <div className="flex-1 w-px bg-neutral-800" />
       </div>
       <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
             <h5 className="text-[11px] font-bold uppercase tracking-tight text-white">{title}</h5>
             <Icon size={14} className="text-neutral-700" />
          </div>
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 leading-relaxed italic">{desc}</p>
       </div>
    </div>
  );
}
