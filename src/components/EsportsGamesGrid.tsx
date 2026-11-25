import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';
import { db, handleFirestoreError, setFirestoreHealth, OperationType } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { GAME_MODES_DATA } from '../constants';
import SafeImage from './SafeImage';
import { resolveSafeModeImage } from '../utils/assetUrl';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface EsportsGamesGridProps {
  matches: Tournament[];
  onPageChange: (page: Page, param?: string) => void;
}

const MODES_CACHE_KEY = 'fxarena_cached_game_modes';

const DEFAULT_FALLBACK_MODES: GameMode[] = (GAME_MODES_DATA.freefire || []).map((mode, idx) => ({
  ...mode,
  gameId: 'freefire',
  order: idx + 1,
}));

function getInitialGameModes(): GameMode[] {
  try {
    const raw = localStorage.getItem(MODES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((m: GameMode) => ({
          ...m,
          image: resolveSafeModeImage(m.image, m.title || m.category || m.id),
        }));
      }
    }
  } catch {
    // Ignore cache read error
  }
  return DEFAULT_FALLBACK_MODES;
}

export default function EsportsGamesGrid({ matches, onPageChange }: EsportsGamesGridProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'tournament' | 'solo'>('all');
  const [modes, setModes] = useState<GameMode[]>(getInitialGameModes);

  // Fetch real dynamic game modes configured in Admin without flashing empty states
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'gameModes'),
      (snapshot) => {
        // Never overwrite cached/default modes with an empty initial offline cache snapshot
        if (snapshot.empty && snapshot.metadata.fromCache) {
          return;
        }

        setFirestoreHealth('operational');
        const fetchedModes = snapshot.docs
          .map((docSnap) => {
            const d = docSnap.data() as Partial<GameMode>;
            const title = d.title || 'ARENA';
            return {
              id: d.id || docSnap.id,
              gameId: d.gameId || 'freefire',
              title,
              subtitle: d.subtitle || 'Battleground',
              image: resolveSafeModeImage(d.image, `${title} ${d.subtitle || ''} ${docSnap.id}`),
              category: d.category || d.subtitle || 'Arena',
              order: Number(d.order ?? 999),
            } as GameMode;
          })
          .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

        if (fetchedModes.length > 0) {
          setModes(fetchedModes);
          try {
            localStorage.setItem(MODES_CACHE_KEY, JSON.stringify(fetchedModes));
          } catch {
            // Ignore storage quota errors
          }
        } else {
          // Keep clean preset fallback modes instead of flashing "No Game Modes Added Yet"
          setModes(DEFAULT_FALLBACK_MODES);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'gameModes');
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter modes dynamically based on active tab
  const filteredModes = modes.filter((mode) => {
    if (activeTab === 'all') return true;

    const titleUpper = (mode.title || '').toUpperCase();
    const subUpper = (mode.subtitle || '').toUpperCase();
    const isSolo =
      titleUpper.includes('SOLO') ||
      titleUpper.includes('1V1') ||
      subUpper.includes('SOLO') ||
      subUpper.includes('1V1');

    if (activeTab === 'solo') {
      return isSolo;
    }
    if (activeTab === 'tournament') {
      return !isSolo;
    }
    return true;
  });

  return (
    <section className="px-4 sm:px-5 mt-6 mb-6">
      {/* Centered Title */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-sm sm:text-base font-black text-white tracking-wide uppercase">
          Esports Arenas &amp; Modes
        </h3>
        <button
          onClick={() => onPageChange(Page.GAME_MODES, 'freefire')}
          className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 tracking-widest transition-colors"
        >
          View All
        </button>
      </div>

      {/* Dynamic Filter Tabs */}
      {modes.length > 0 && (
        <div className="w-full bg-[#0a152b] border border-[#1b2b4d] p-1 rounded-2xl flex items-center mb-4 select-none">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'all'
                ? 'bg-[#1e3461] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ALL MODES
          </button>
          <button
            onClick={() => setActiveTab('tournament')}
            className={`flex-1 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'tournament'
                ? 'bg-[#1e3461] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            SQUAD / DUO
          </button>
          <button
            onClick={() => setActiveTab('solo')}
            className={`flex-1 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'solo'
                ? 'bg-white text-[#0f172a] shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            SOLO
          </button>
        </div>
      )}

      {/* Dynamic 3-Column Cards Grid */}
      {filteredModes.length === 0 ? (
        <div className="text-center py-8 bg-[#091326] border border-[#1b2f56] rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No modes found in this tab</p>
          <button
            onClick={() => setActiveTab('all')}
            className="mt-2 text-[10px] text-blue-400 font-black uppercase underline"
          >
            Show All Modes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {filteredModes.map((mode) => {
            const activeMatchesCount = matches.filter(
              (m) =>
                m.status === 'upcoming' &&
                (m.modeId === mode.id ||
                  m.mode?.toLowerCase() === mode.title.toLowerCase() ||
                  m.section?.toLowerCase() === (mode.category || mode.subtitle || '').toLowerCase())
            ).length;

            return (
              <motion.div
                key={mode.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => onPageChange(Page.TOURNAMENTS, `${mode.gameId || 'freefire'}?mode=${mode.id}`)}
                className="group relative rounded-xl sm:rounded-2xl overflow-hidden border border-[#1b2f56] bg-[#091326] shadow-lg flex flex-col justify-end aspect-[1/1.2] cursor-pointer select-none"
              >
                {/* Background Character Graphic */}
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                  <SafeImage
                    src={resolveSafeModeImage(mode.image, `${mode.title} ${mode.subtitle || ''} ${mode.id}`)}
                    fallbackSrc={resolveSafeModeImage('', `${mode.title} ${mode.subtitle || ''} ${mode.id}`)}
                    alt={mode.title}
                    className="w-full h-full"
                    imgClassName="group-hover:scale-110 transition-transform duration-500 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#060e1e] via-[#060e1e]/40 to-transparent" />
                </div>

                {/* Match count badge if matches are live */}
                {activeMatchesCount > 0 && (
                  <div className="absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 bg-emerald-500/90 backdrop-blur-sm rounded-md text-[7px] font-black uppercase text-white shadow-sm">
                    {activeMatchesCount} Live
                  </div>
                )}

                {/* Bottom Dark Navy Bar */}
                <div className="relative z-10 mt-auto w-full bg-[#121c33] border-t border-[#1e2f52] py-1.5 sm:py-2 px-1 text-center">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-white truncate block">
                    {mode.title}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
