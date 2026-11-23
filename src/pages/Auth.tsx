import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { Mail, Lock, Phone, User as UserIcon, Ticket, ArrowRight, Gamepad2, Chrome, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import SafeImage from '../components/SafeImage';
import { APP_LOGO_URL } from '../utils/assetUrl';
import { auth, db } from '../lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthProps {
  onLogin: () => void;
}

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

export default function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [referralInput, setReferralInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('ref') || '';
  });
  
  // Error State
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validatePhone = (p: string) => {
    return p.length === 10 && /^\d+$/.test(p);
  };

  // Helper for performance timeout
  const withTimeout = async <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeout]);
  };

  const getReferrerFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref');
  };

  const mapAuthError = (error: any) => {
    const code = typeof error === 'string' ? error : (error?.code || '');
    const msg = typeof error === 'object' && error?.message ? String(error.message) : '';

    if (code === 'auth/operation-not-allowed' || msg.includes('PASSWORD_LOGIN_DISABLED')) {
      return 'Email/Password signup is not enabled in Firebase Console yet. Enable Email/Password in Firebase Auth Providers or use "Continue with Google".';
    }
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Email already registered. Please Login instead.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a minute and try again.';
      case 'auth/unauthorized-domain':
        return 'This app domain is not authorized in Firebase Auth settings.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in was cancelled. Please try again.';
      case 'auth/operation-not-supported-in-this-environment':
      case 'auth/popup-blocked':
        return 'Google popup is not supported in this view. Please use Email & Password.';
      default:
        return msg || 'Authentication failed. Please try again.';
    }
  };

  const handleForgotPassword = async () => {
    setErrors({});
    setSuccessMsg('');

    if (!email) {
      setErrors({ email: 'Enter your email' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrors({ email: 'Invalid email format' });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await withTimeout(sendPasswordResetEmail(auth, email.trim()), 15000, 'Request timed out. Please try again.');
      setSuccessMsg('Password reset link sent to your email');
    } catch (error: any) {
      console.error(error);
      setErrors({ email: mapAuthError(error) });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate requests
    
    setErrors({});
    setSuccessMsg('');
    
    const cleanEmail = email.trim();
    const cleanUsername = username.trim().slice(0, 100);
    const cleanPhone = phone.trim().slice(0, 30);

    // Basic Validation
    const newErrors: { [key: string]: string } = {};
    if (!cleanEmail) newErrors.email = 'Email required';
    if (!password) newErrors.password = 'Password required';
    if (password && password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    
    if (!isLogin) {
      if (!cleanUsername) newErrors.username = 'Username required';
      if (!cleanPhone) {
        newErrors.phone = '10 digit phone required';
      } else if (!validatePhone(cleanPhone)) {
        newErrors.phone = 'Enter valid 10 digit number';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        try {
          await withTimeout(signInWithEmailAndPassword(auth, cleanEmail, password), 15000, 'Login taking too long. Check connection.');
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error) });
        }
      } else {
        try {
          const userCredential = await withTimeout(
            createUserWithEmailAndPassword(auth, cleanEmail, password),
            15000,
            'Signup taking too long. Check connection.'
          );
          const firebaseUser = userCredential.user;

          // Simple device ID tracking
          let deviceId = localStorage.getItem('khel_galli_device_id');
          if (!deviceId) {
            deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
            localStorage.setItem('khel_galli_device_id', deviceId);
          }

          const referredBy = referralInput.trim().slice(0, 100) || getReferrerFromUrl();

          // Create Firestore Document with graceful failure
          try {
            await withTimeout(
              setDoc(doc(db, 'users', firebaseUser.uid), {
                username: cleanUsername,
                email: cleanEmail.slice(0, 200),
                phone: cleanPhone,
                ...DEFAULT_USER_DATA,
                referredBy: referredBy || null,
                deviceId,
                referralClaimed: false,
                createdAt: serverTimestamp(),
              }),
              8000,
              'Profile setup delayed.'
            );
          } catch (fsError) {
            console.warn('Firestore profile creation failed or timed out:', fsError);
          }

          setSuccessMsg('Registration successful! Redirecting...');
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error) });
        }
      }
    } catch (err: any) {
      setErrors({ general: mapAuthError(err) });
    } finally {
      setLoading(false);
    }
  };

  const isNativeApk =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  const handleGoogleLogin = async () => {
    if (isNativeApk) {
      setErrors({
        general:
          'Mobile APK supports Email & Password login. New here? Tap "Register here" above. Already used Google on web? Enter your Gmail and tap "Forgot Password?" to set a password.',
      });
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onLogin();
    } catch (error: any) {
      console.error('Login failed:', error);
      setErrors({ general: mapAuthError(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 pt-12 pb-8 max-w-lg mx-auto">
      <div className="flex-1 flex flex-col pt-8">
        <div className="mb-10 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-4"
          >
            <SafeImage 
              src={APP_LOGO_URL} 
              alt="FX Arena eSport Logo" 
              className="w-24 h-24 rounded-2xl object-cover shadow-2xl border border-white/10"
            />
          </motion.div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">Start winning real rewards</p>
        </div>

        <div className="bg-neutral-900 rounded-[2.5rem] border-[6px] border-neutral-800 p-8 shadow-2xl relative overflow-hidden mb-8">
          <div className="flex gap-4 mb-8 bg-black/30 p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => { setIsLogin(true); setErrors({}); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                isLogin ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40' : 'text-neutral-500'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => { setIsLogin(false); setErrors({}); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                !isLogin ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40' : 'text-neutral-500'
              }`}
            >
              Register
            </button>
          </div>

          {errors.general && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-500 text-[10px] font-bold uppercase tracking-wider"
            >
              <AlertCircle size={14} />
              {errors.general}
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-500 text-[10px] font-bold uppercase tracking-wider"
            >
              <CheckCircle2 size={14} />
              {successMsg}
            </motion.div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className={`w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border transition-colors focus:outline-hidden ${
                        errors.email ? 'border-red-500/50' : 'border-neutral-700 focus:border-purple-500/50'
                      }`}
                    />
                    {errors.email && <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest ml-1">{errors.email}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border transition-colors focus:outline-hidden ${
                        errors.password ? 'border-red-500/50' : 'border-neutral-700 focus:border-purple-500/50'
                      }`}
                    />
                    {errors.password && <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest ml-1">{errors.password}</span>}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotPasswordLoading || loading}
                      className="text-[9px] font-bold uppercase tracking-widest text-purple-500 hover:text-purple-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {forgotPasswordLoading && <div className="w-2.5 h-2.5 border border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />}
                      Forgot Password?
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className={`w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border transition-colors focus:outline-hidden ${
                        errors.username ? 'border-red-500/50' : 'border-neutral-700 focus:border-purple-500/50'
                      }`}
                    />
                    {errors.username && <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest ml-1">{errors.username}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className={`w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border transition-colors focus:outline-hidden ${
                        errors.email ? 'border-red-500/50' : 'border-neutral-700 focus:border-purple-500/50'
                      }`}
                    />
                    {errors.email && <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest ml-1">{errors.email}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10 digit number"
                      className={`w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border transition-colors focus:outline-hidden ${
                        errors.phone ? 'border-red-500/50' : 'border-neutral-700 focus:border-purple-500/50'
                      }`}
                    />
                    {errors.phone && <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest ml-1">{errors.phone}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border transition-colors focus:outline-hidden ${
                        errors.password ? 'border-red-500/50' : 'border-neutral-700 focus:border-purple-500/50'
                      }`}
                    />
                    {errors.password && <span className="text-[8px] text-red-500 font-bold uppercase tracking-widest ml-1">{errors.password}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Referral Code (Optional)</label>
                    <input
                      type="text"
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value)}
                      placeholder="Friend's username / code"
                      className="w-full h-11 bg-neutral-800 rounded-lg px-4 text-xs text-white border border-neutral-700 focus:border-purple-500/50 transition-colors focus:outline-hidden"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white font-black h-12 rounded-xl mt-4 shadow-lg shadow-purple-600/40 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                isLogin ? 'Login' : 'Register'
              )}
            </button>
          </form>

          {!isNativeApk ? (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="h-px flex-1 bg-neutral-800" />
                <span className="text-[10px] uppercase font-black tracking-widest text-neutral-600">OR</span>
                <div className="h-px flex-1 bg-neutral-800" />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white text-black font-black h-12 rounded-xl shadow-lg shadow-white/5 flex items-center justify-center gap-3 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] disabled:opacity-50"
              >
                <Chrome size={18} />
                {loading ? 'Processing...' : 'Continue with Google'}
              </button>
            </>
          ) : (
            <p className="text-[10px] text-center mt-5 text-neutral-400 leading-relaxed bg-black/30 border border-white/5 rounded-xl px-3 py-2.5">
              Used Google Sign-In on web earlier? Enter that Gmail above and tap <span className="text-purple-400 font-bold">Forgot Password?</span> to set an app password.
            </p>
          )}
          
          <div className="text-[10px] text-center mt-6 text-neutral-500">
            {isLogin ? 'New player?' : 'Existing player?'}{' '}
            <button 
              type="button"
              disabled={loading}
              onClick={() => { setIsLogin(!isLogin); setErrors({}); setSuccessMsg(''); }} 
              className="text-purple-500 font-bold hover:underline disabled:no-underline"
            >
              {isLogin ? 'Register here' : 'Login here'}
            </button>
          </div>

          {!isNativeApk && (
            <div className="mt-5 pt-4 border-t border-white/5 text-center">
              <Link
                to="/download"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-wider text-purple-300 transition-all"
              >
                <Download size={13} />
                <span>Download Android APK</span>
              </Link>
            </div>
          )}
        </div>
      </div>
      
      <p className="text-center text-zinc-600 text-[10px] uppercase font-bold tracking-widest px-8">
        By continuing, you agree to our <span className="text-zinc-400">Terms of Service</span> and <span className="text-zinc-400">Privacy Policy</span>
      </p>
    </div>
  );
}
