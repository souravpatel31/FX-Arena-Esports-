import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Banknote,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  AlertCircle
} from 'lucide-react';
import { Page, User, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, increment, runTransaction, collection, serverTimestamp } from 'firebase/firestore';
import { paymentService } from '../services/paymentService';

interface WithdrawProps {
  user: User;
  onPageChange: (page: Page) => void;
}

const WITHDRAW_METHODS = [
  { id: 'fampay', label: 'FamPay', placeholder: 'yourname@fam', badgeColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { id: 'phonepe', label: 'PhonePe', placeholder: '9876543210@ybl', badgeColor: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  { id: 'gpay', label: 'GPay', placeholder: 'yourname@okaxis', badgeColor: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  { id: 'navi', label: 'Navi', placeholder: '9876543210@naviaxis', badgeColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'any_upi', label: 'Any UPI ID', placeholder: 'yourid@upi', badgeColor: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' }
] as const;

export default function Withdraw({ user, onPageChange }: WithdrawProps) {
  const [amount, setAmount] = useState('100');
  const [selectedMethod, setSelectedMethod] = useState<string>('fampay');
  const [upiId, setUpiId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);

  useEffect(() => {
    const fetchGateway = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetchGateway();
  }, []);

  const activeMethodObj = WITHDRAW_METHODS.find((m) => m.id === selectedMethod) || WITHDRAW_METHODS[0];
  const numericAmount = parseInt(amount, 10);
  const availableWinnings = user.wallet?.winnings || 0;
  const trimmedUpi = upiId.trim();
  const isValidUpi = /^[^\s@]+@[^\s@]+\.?[^\s@]*$/.test(trimmedUpi) && trimmedUpi.includes('@');
  const isAmountValid = !isNaN(numericAmount) && numericAmount >= 100 && numericAmount <= 50000 && numericAmount <= availableWinnings;

  const handleWithdraw = async () => {
    if (!auth.currentUser || !isAmountValid) return;
    if (!isValidUpi) {
      alert('Please enter a valid UPI ID (e.g. name@ybl or number@fam).');
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await runTransaction(db, async (transaction) => {
        const uSnap = await transaction.get(userRef);
        if (!uSnap.exists()) throw new Error('User not found');

        const userData = uSnap.data() as User;
        const currentWinnings = userData.wallet?.winnings || 0;

        if (currentWinnings < numericAmount) throw new Error('Insufficient winnings balance');

        transaction.update(userRef, {
          'wallet.winnings': increment(-numericAmount)
        });

        const transRef = doc(collection(db, 'transactions'));
        const safeUpi = trimmedUpi.slice(0, 128);
        transaction.set(transRef, {
          userId: auth.currentUser!.uid,
          type: 'withdraw',
          amount: numericAmount,
          status: 'pending',
          paymentMethod: activeMethodObj.label,
          upiId: safeUpi,
          title: `Withdraw via ${activeMethodObj.label} (${safeUpi})`.slice(0, 200),
          createdAt: serverTimestamp()
        });
      });
      setSubmittedSuccess(true);
    } catch (error: any) {
      alert(error.message || 'Withdrawal failed');
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  if (submittedSuccess) {
    return (
      <div className="pb-24 max-w-lg mx-auto bg-background min-h-screen flex items-center justify-center px-5">
        <div className="w-full bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto mb-5">
            <CheckCircle2 size={34} />
          </div>
          <h3 className="text-xl font-black italic uppercase tracking-tight text-white mb-2">
            Withdrawal <span className="text-emerald-400">Requested!</span>
          </h3>
          <p className="text-xs text-neutral-400 leading-relaxed mb-6">
            ₹{numericAmount.toLocaleString()} withdrawal via <span className="text-white font-bold">{activeMethodObj.label}</span> to <span className="text-purple-400 font-bold">{trimmedUpi}</span> has been submitted. Admin will process your payout shortly.
          </p>
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
          >
            Return to Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-lg mx-auto bg-background min-h-screen">
      <div className="px-5 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tighter uppercase italic">
              Secure <span className="text-purple-500">Withdrawal</span>
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={10} className="text-emerald-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/80">
                {activeGateway ? `UPI Payouts • ${activeGateway.name}` : 'Instant UPI Payouts'}
              </span>
            </div>
          </div>
        </div>

        {/* Withdrawal Amount Card */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-7 mb-6 flex flex-col items-center shadow-2xl relative overflow-hidden">
          <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 mb-4 shadow-xl shadow-purple-500/5 border border-purple-500/10">
            <Banknote size={28} />
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-1.5">
            Available for withdrawal
          </p>
          <h3 className="text-4xl font-black tracking-tighter mb-6 italic">
            ₹{availableWinnings.toLocaleString()}
          </h3>

          <div className="w-full space-y-1.5 text-left mb-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
              Amount to Transfer
            </label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-black text-neutral-600 italic">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-black border border-neutral-800 rounded-2xl py-4 pl-10 pr-5 text-xl font-black tracking-tight outline-hidden focus:border-purple-500/60 text-white italic"
                placeholder="100"
              />
            </div>
            <div className="flex justify-between px-2 mt-2">
              <p className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.2em]">Min: ₹100</p>
              <p className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.2em]">Max: ₹50k</p>
            </div>
            {!isNaN(numericAmount) && numericAmount > 0 && numericAmount < 100 && (
              <p className="text-[10px] font-bold text-red-400 flex items-center gap-1 pt-1">
                <AlertCircle size={12} />
                <span>Minimum withdrawal amount is ₹100</span>
              </p>
            )}
            {!isNaN(numericAmount) && numericAmount >= 100 && numericAmount > availableWinnings && (
              <p className="text-[10px] font-bold text-red-400 flex items-center gap-1 pt-1">
                <AlertCircle size={12} />
                <span>Insufficient winnings balance (Available: ₹{availableWinnings})</span>
              </p>
            )}
          </div>

          {/* Quick Amount Chips */}
          <div className="grid grid-cols-4 gap-2 w-full mt-2">
            {['100', '200', '500', '1000'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className={`py-2 rounded-xl text-[10px] font-black border transition-all active:scale-95 ${
                  amount === val
                    ? 'bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-600/20'
                    : 'bg-black/60 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                ₹{val}
              </button>
            ))}
          </div>
        </section>

        {/* Withdrawal Method Selection */}
        <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-neutral-400 mb-3 pl-1">
          Select Withdrawal App / UPI
        </h4>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {WITHDRAW_METHODS.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethod(method.id)}
                className={`p-3 rounded-2xl border text-left transition-all active:scale-95 flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-purple-600/15 border-purple-500 shadow-lg shadow-purple-500/10'
                    : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${method.badgeColor}`}>
                    <Smartphone size={14} />
                  </div>
                  {isSelected && <CheckCircle2 size={14} className="text-purple-400" />}
                </div>
                <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                  {method.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* UPI ID Input */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
              Enter {activeMethodObj.label} UPI ID *
            </label>
            <span className="text-[8px] font-bold text-purple-400 uppercase">
              {activeMethodObj.label}
            </span>
          </div>
          <input
            type="text"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder={activeMethodObj.placeholder}
            className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder:text-neutral-600 outline-none focus:border-purple-500 transition-all"
          />
          {upiId.trim().length > 0 && !isValidUpi && (
            <p className="text-[10px] font-bold text-red-400 flex items-center gap-1">
              <AlertCircle size={12} />
              <span>Enter a valid UPI ID (example: {activeMethodObj.placeholder})</span>
            </p>
          )}
        </div>

        {/* Advisory */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 mb-7 flex gap-3.5">
          <ShieldAlert className="text-neutral-600 shrink-0" size={18} />
          <div className="space-y-1">
            <h5 className="text-[10px] font-black uppercase tracking-widest leading-none text-neutral-400">
              Payout Information
            </h5>
            <p className="text-[9px] text-neutral-500 font-medium leading-relaxed">
              Double-check your {activeMethodObj.label} UPI ID before submitting. Funds are transferred directly to your UPI ID after Admin verification.
            </p>
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={loading || !isAmountValid || !isValidUpi}
          className={`w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-2xl flex items-center justify-center gap-3 transition-all ${
            loading || !isAmountValid || !isValidUpi
              ? 'bg-neutral-900 text-neutral-700 cursor-not-allowed'
              : 'bg-purple-600 text-white shadow-purple-600/40 active:scale-95'
          }`}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : `Withdraw via ${activeMethodObj.label}`}
        </button>
      </div>
    </div>
  );
}
