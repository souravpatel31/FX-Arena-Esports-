import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  RefreshCw,
  Sparkles,
  X,
  CheckCircle2,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import { APP_LOGO_URL } from '../utils/assetUrl';
import { AppUpdateInfo, applyWebUpdate } from '../utils/appUpdater';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface AppUpdateModalProps {
  isOpen: boolean;
  updateInfo: AppUpdateInfo | null;
  onDismiss: () => void;
  onRecheck?: () => void;
  isRechecking?: boolean;
}

export default function AppUpdateModal({
  isOpen,
  updateInfo,
  onDismiss,
  isRechecking = false,
  onRecheck,
}: AppUpdateModalProps) {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [isApplyingWebUpdate, setIsApplyingWebUpdate] = useState(false);

  useModalBackHandler(Boolean(isOpen && updateInfo && !updateInfo.forceUpdate), onDismiss);

  if (!updateInfo) return null;

  const handleWebUpdateClick = async () => {
    setIsApplyingWebUpdate(true);
    await applyWebUpdate();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 18 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="w-full max-w-sm rounded-[2rem] bg-gradient-to-b from-[#131b35] via-[#0c1224] to-[#080c18] border border-purple-500/40 shadow-2xl shadow-purple-950/70 p-6 text-white relative overflow-hidden"
          >
            {!updateInfo.forceUpdate && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Close update dialog"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            )}

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <img
                  src={APP_LOGO_URL}
                  alt="FX Arena eSport"
                  className="w-20 h-20 rounded-2xl object-cover border border-white/20 shadow-xl"
                />
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 border border-white/30 flex items-center justify-center shadow-lg">
                  <Sparkles size={15} className="text-white" />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                  <Smartphone size={11} />
                  {updateInfo.forceUpdate ? 'Required Update' : 'New Version Ready'}
                </span>
                <h3 className="text-lg font-black uppercase italic tracking-tight text-white">
                  {updateInfo.title}
                </h3>
                <div className="flex items-center justify-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                    v{updateInfo.currentVersion}
                  </span>
                  <span className="text-purple-400">→</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-purple-600/25 border border-purple-500/40 text-purple-200 font-black">
                    v{updateInfo.latestVersion}
                  </span>
                </div>
              </div>

              <div className="w-full p-3.5 rounded-2xl bg-black/40 border border-white/10 text-left">
                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                  {updateInfo.message}
                </p>
              </div>

              {updateInfo.isNativeApk ? (
                <div className="w-full space-y-2.5 pt-1">
                  <a
                    href={updateInfo.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDownloadStarted(true)}
                    className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-purple-600/30 active:scale-[0.98] transition-all"
                  >
                    <Download size={16} />
                    <span>Update Now</span>
                  </a>

                  {downloadStarted && (
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-black">
                        <CheckCircle2 size={14} />
                        <span>Downloading latest FX-Arena.apk...</span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-snug">
                        Open the downloaded APK from your phone&apos;s notification bar to install the update. (If Android shows &quot;App not installed&quot;, uninstall the older app once and install the new APK.)
                      </p>
                      {updateInfo.fallbackDownloadUrl &&
                        updateInfo.fallbackDownloadUrl !== updateInfo.downloadUrl && (
                          <a
                            href={updateInfo.fallbackDownloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-black text-purple-300 underline pt-0.5"
                          >
                            <span>Direct APK Mirror</span>
                            <ExternalLink size={11} />
                          </a>
                        )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleWebUpdateClick}
                    disabled={isApplyingWebUpdate}
                    className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-purple-600/30 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    <RefreshCw size={16} className={isApplyingWebUpdate ? 'animate-spin' : ''} />
                    <span>{isApplyingWebUpdate ? 'Updating App...' : 'Update Now'}</span>
                  </button>

                  <a
                    href={updateInfo.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-200 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Download size={13} className="text-purple-300" />
                    <span>Download Latest APK</span>
                  </a>
                </div>
              )}

              <div className="w-full flex items-center justify-center gap-3">
                {onRecheck && (
                  <button
                    type="button"
                    onClick={onRecheck}
                    disabled={isRechecking}
                    className="py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider text-purple-300 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isRechecking ? 'animate-spin' : ''} />
                    <span>Re-check</span>
                  </button>
                )}

                {!updateInfo.forceUpdate && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                  >
                    Later
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
