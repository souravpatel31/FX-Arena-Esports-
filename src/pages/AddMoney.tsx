import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Zap,
  Loader2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  QrCode,
  Copy,
  Check,
  X
} from 'lucide-react';
import { Page, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { paymentService } from '../services/paymentService';

interface AddMoneyProps {
  onPageChange: (page: Page) => void;
}

interface PaymentQrConfig {
  qrImageUrl?: string;
  amountQrs?: Record<string, string>;
  upiId?: string;
  merchantName?: string;
  isActive?: boolean;
}

export default function AddMoney({ onPageChange }: AddMoneyProps) {
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);
  const [qrConfig, setQrConfig] = useState<PaymentQrConfig | null>(null);

  // QR Scanner Modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [submittingQr, setSubmittingQr] = useState(false);
  const [qrSubmitted, setQrSubmitted] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Gateway Polling state (ZapUPI fallback)
  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const presetAmounts = ['15', '25', '50', '100', '200', '500', '1000'];

  const numericAmount = parseInt(amount, 10);
  const isAmountValid = !isNaN(numericAmount) && numericAmount >= 10 && numericAmount <= 10000;
  const isBelowMin = !isNaN(numericAmount) && numericAmount > 0 && numericAmount < 10;
  const isAboveMax = !isNaN(numericAmount) && numericAmount > 10000;

  const amountKey = !isNaN(numericAmount) ? String(numericAmount) : amount.trim();
  const resolvedQrUrl = (qrConfig?.amountQrs && qrConfig.amountQrs[amountKey]) || qrConfig?.qrImageUrl || '';
  const hasAnyQr = Boolean(
    qrConfig?.qrImageUrl ||
    (qrConfig?.amountQrs && Object.values(qrConfig.amountQrs).some((u) => typeof u === 'string' && Boolean(u.trim())))
  );
  const isQrAvailable = Boolean(resolvedQrUrl && qrConfig?.isActive !== false);
  const hasConfiguredGateway = Boolean(activeGateway && (activeGateway.isConfigured || activeGateway.apiKey || activeGateway.merchantId));
  const useQrFlow = isQrAvailable || (hasAnyQr && qrConfig?.isActive !== false) || qrConfig?.isActive !== false || !hasConfiguredGateway;

  useEffect(() => {
    const unsubQr = onSnapshot(
      doc(db, 'appSettings', 'payment_qr'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setQrConfig((data.paymentQr || data) as PaymentQrConfig);
        } else {
          setQrConfig(null);
        }
      },
      (err) => {
        console.warn('[AddMoney] QR settings listener:', err.message);
      }
    );

    const fetchGateway = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetchGateway();

    return () => unsubQr();
  }, []);

  useEffect(() => {
    let interval: any;
    let timeout: any;

    if (pollingActive && pollingOrderId) {
      setPollingTimedOut(false);

      timeout = setTimeout(() => {
        setPollingActive(false);
        setPollingTimedOut(true);
      }, 5 * 60 * 1000);

      const checkStatus = async () => {
        try {
          const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
          const res = await fetch('/api/zapupi/check-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
            },
            body: JSON.stringify({ order_id: pollingOrderId })
          });

          if (res.ok) {
            const data = await res.json();
            const detailSt = String(data.detail?.status || data.detail?.order_status || '').toLowerCase();
            const isFinished =
              data.status === 'success' ||
              detailSt === 'success' ||
              detailSt === 'paid' ||
              detailSt === 'completed';

            if (isFinished) {
              clearInterval(interval);
              clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              setTimeout(() => {
                window.location.href = '/wallet?payment=success';
              }, 500);
            } else if (data.status === 'failed' || detailSt === 'failed' || detailSt === 'failure') {
              clearInterval(interval);
              clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              window.location.href = '/wallet?payment=failed';
            }
          }
        } catch (err) {
          console.error('[AddMoney] Polling error:', err);
        }
      };

      checkStatus();
      interval = setInterval(checkStatus, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [pollingActive, pollingOrderId]);

  const handleDeposit = async () => {
    if (!auth.currentUser || !amount) return;
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 10 || value > 10000) return;

    // 1. If Admin has configured a QR Scanner (or no automated gateway has keys), use QR Scanner flow
    if (useQrFlow) {
      if (!isQrAvailable) {
        if (hasAnyQr && qrConfig?.isActive !== false) {
          alert(`QR Scanner is not set for ₹${value} yet. Please select a preset amount or ask Admin to set a Default QR Scanner.`);
        } else {
          alert('QR Scanner is not uploaded yet. Please ask Admin to upload the QR Scanner in Admin Panel -> Payment.');
        }
        return;
      }
      setUtrNumber('');
      setQrSubmitted(false);
      setShowQrModal(true);
      return;
    }

    // 2. Automated Gateway fallback (ZapUPI / Cashfree) when QR Scanner is disabled
    setLoading(true);
    try {
      const result: any = await paymentService.initiateDeposit(value, auth.currentUser.uid);

      if (activeGateway?.id === 'zapupi' || result?.order_id) {
        setPollingOrderId(result.order_id);
        setPollingActive(true);
        if (result.payment_url) {
          window.open(result.payment_url, '_blank');
        }
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Payment initiation failed';
      console.error('[AddMoney] Error:', error);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitQrPayment = async () => {
    if (!auth.currentUser) return;
    const cleanUtr = utrNumber.trim().slice(0, 64);
    if (cleanUtr.length < 6) {
      alert('Please enter your valid UTR / Transaction Reference ID (at least 6 characters).');
      return;
    }

    setSubmittingQr(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: auth.currentUser.uid,
        type: 'deposit',
        amount: numericAmount,
        status: 'pending',
        paymentMethod: 'QR Scanner',
        utrNumber: cleanUtr,
        title: `QR Deposit (UTR: ${cleanUtr})`.slice(0, 200),
        createdAt: serverTimestamp()
      });
      setQrSubmitted(true);
    } catch (error: any) {
      console.error('[AddMoney] QR Deposit submit error:', error);
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
      alert(error?.message || 'Failed to submit deposit request.');
    } finally {
      setSubmittingQr(false);
    }
  };

  const handleCopyUpi = () => {
    if (!qrConfig?.upiId) return;
    navigator.clipboard.writeText(qrConfig.upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleQuickAmountClick = (val: string) => {
    setAmount(val);
  };

  const handleClear = () => {
    setAmount('');
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-neutral-900 pb-20 max-w-lg mx-auto select-none relative">
      {/* 1. HEADER */}
      <header className="sticky top-0 z-30 bg-[#0a1835] text-white shadow-lg border-b border-[#182a52] px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="p-1 -ml-1 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95 flex items-center justify-center"
            aria-label="Back to Wallet"
          >
            <ChevronLeft size={24} className="stroke-[2.5]" />
          </button>
          <h1 className="text-base sm:text-lg font-black tracking-wide">
            Add Coins
          </h1>
        </div>

        <div className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase text-emerald-300 border border-emerald-400/20">
          <ShieldCheck size={12} className="text-emerald-400" />
          <span>Secure</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* 2. PAYMENT PROVIDER CARD */}
        <div className="bg-[#fcf9ff] border border-purple-200/90 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-100/80 border border-purple-200 flex items-center justify-center text-purple-600 shrink-0">
            {useQrFlow ? (
              <QrCode size={20} className="text-purple-600" />
            ) : (
              <Zap size={20} className="fill-purple-500 text-purple-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs sm:text-sm font-black text-purple-900 leading-tight">
              {useQrFlow
                ? 'Pay via UPI QR Code Scanner'
                : `Instant Payment via ${activeGateway?.name || 'UPI'}`}
            </h2>
            <p className="text-[11px] font-semibold text-purple-600/80 mt-0.5 tracking-tight">
              {useQrFlow
                ? 'Supports FamPay, PhonePe, GPay, Navi & Any UPI'
                : 'Secure & Fast • UPI, Cards, NetBanking'}
            </p>
          </div>
        </div>

        {/* 3. AMOUNT SECTION */}
        <div className="pt-2">
          <div className="flex items-center gap-2 pb-2 border-b-2 border-slate-200">
            <span className="text-lg leading-none select-none">💵</span>
            <h3 className="text-xs sm:text-sm font-bold text-slate-500 tracking-tight">
              Amount (Min: ₹10 | Max: ₹10000)
            </h3>
          </div>

          <div className="mt-3 bg-white border border-neutral-200/90 rounded-2xl p-3 sm:p-4 shadow-xs flex items-center justify-between focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 transition-all">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xl sm:text-2xl font-black text-neutral-800">₹</span>
              <input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-xl sm:text-2xl font-black text-neutral-900 placeholder:text-neutral-300 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {amount && (
              <button
                onClick={handleClear}
                className="text-xs font-bold text-neutral-400 hover:text-neutral-600 px-2 py-1 bg-neutral-100 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>

          {isBelowMin && (
            <p className="text-[11px] font-bold text-red-500 mt-1.5 flex items-center gap-1 pl-1">
              <AlertCircle size={13} />
              <span>Minimum deposit amount is ₹10</span>
            </p>
          )}
          {isAboveMax && (
            <p className="text-[11px] font-bold text-red-500 mt-1.5 flex items-center gap-1 pl-1">
              <AlertCircle size={13} />
              <span>Maximum deposit amount is ₹10,000</span>
            </p>
          )}
        </div>

        {/* 4. QUICK AMOUNT BUTTONS (15, 25, 50, 100, 200, 500, 1000 + Clear) */}
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
          {presetAmounts.map((preset) => {
            const isSelected = amount === preset;
            return (
              <button
                key={preset}
                onClick={() => handleQuickAmountClick(preset)}
                className={`py-3 sm:py-3.5 px-2 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 shadow-xs border ${
                  isSelected
                    ? 'bg-orange-50/60 border-orange-500 text-orange-600 ring-2 ring-orange-500/20'
                    : 'bg-white border-neutral-200/90 text-neutral-900 hover:border-neutral-300'
                }`}
              >
                ₹{preset}
              </button>
            );
          })}

          <button
            onClick={handleClear}
            className="py-3 sm:py-3.5 px-2 rounded-xl text-xs sm:text-sm font-black bg-white border border-neutral-200/90 text-neutral-900 hover:border-neutral-300 active:scale-95 shadow-xs transition-all"
          >
            Clear
          </button>
        </div>

        {/* 5. MAIN PAYMENT BUTTON */}
        <div className="pt-2">
          <button
            onClick={handleDeposit}
            disabled={loading || !isAmountValid}
            className="w-full py-4 sm:py-4.5 bg-[#f97316] hover:bg-[#ea580c] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white rounded-xl sm:rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>PROCESSING...</span>
              </>
            ) : useQrFlow ? (
              <>
                <QrCode size={18} />
                <span>PAY WITH QR SCANNER</span>
              </>
            ) : (
              <span>PAY WITH {activeGateway?.name?.toUpperCase()}</span>
            )}
          </button>
        </div>

        {/* 6. PAYMENT INFORMATION CARD */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs space-y-3.5">
          {[
            'Choose ₹15, ₹25, ₹50, ₹100, ₹200, ₹500, ₹1000 or enter any custom amount.',
            'Scan the QR Code using FamPay, PhonePe, GPay, Navi, or any UPI app.',
            'After paying, enter your 12-digit UTR / Reference number.',
            'Coins will be added once verified by Admin.',
            'Do not submit fake UTR numbers; fake requests will be rejected.'
          ].map((text, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f97316] mt-2 shrink-0" />
              <p className="text-xs sm:text-[13px] font-medium text-neutral-700 leading-snug">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* QR SCANNER PAYMENT MODAL                                                  */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showQrModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 text-neutral-900 shadow-2xl border border-neutral-200 relative my-auto"
            >
              <button
                onClick={() => {
                  setShowQrModal(false);
                  if (qrSubmitted) onPageChange(Page.WALLET);
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              {qrSubmitted ? (
                <div className="py-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4 text-emerald-600">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-lg font-black uppercase text-neutral-900 mb-1">
                    Request Submitted!
                  </h3>
                  <p className="text-xs text-neutral-600 font-medium leading-relaxed mb-5">
                    Your deposit request of <span className="font-black text-neutral-900">₹{numericAmount}</span> (UTR: <span className="font-mono font-bold">{utrNumber}</span>) has been sent. Coins will be added to your wallet after Admin verification.
                  </p>
                  <button
                    onClick={() => {
                      setShowQrModal(false);
                      onPageChange(Page.WALLET);
                    }}
                    className="w-full py-3.5 bg-[#0a1835] hover:bg-[#132957] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Go to Wallet
                  </button>
                </div>
              ) : (
                <div>
                  <div className="text-center mb-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-[10px] font-black uppercase tracking-wider mb-2">
                      <QrCode size={12} /> Scan & Pay
                    </span>
                    <h3 className="text-xl font-black text-neutral-900">
                      Pay ₹{numericAmount}
                    </h3>
                    {qrConfig?.merchantName && (
                      <p className="text-[11px] font-bold text-neutral-500 mt-0.5">
                        {qrConfig.merchantName}
                      </p>
                    )}
                  </div>

                  {/* QR Code Frame */}
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center mb-4">
                    <div className="w-52 h-52 sm:w-56 sm:h-56 bg-white rounded-xl p-2 shadow-sm border border-neutral-200 flex items-center justify-center overflow-hidden">
                      <img
                        src={resolvedQrUrl}
                        alt="UPI Payment QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[10px] font-bold text-neutral-500 mt-2.5 text-center">
                      FamPay • PhonePe • GPay • Navi • Any UPI App
                    </p>
                  </div>

                  {/* Optional Copy UPI ID */}
                  {qrConfig?.upiId && (
                    <div className="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 mb-4">
                      <div className="min-w-0 pr-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                          UPI ID
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate block select-all">
                          {qrConfig.upiId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50 flex items-center gap-1 shrink-0"
                      >
                        {copiedUpi ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  {/* UTR / Ref Input */}
                  <div className="space-y-1.5 mb-4">
                    <label className="text-[10px] font-black uppercase tracking-wider text-neutral-600 block">
                      Enter UTR / Transaction ID *
                    </label>
                    <input
                      type="text"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      placeholder="e.g. 412345678901"
                      className="w-full bg-white border border-neutral-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-xl px-3.5 py-3 text-sm font-bold text-neutral-900 outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitQrPayment}
                    disabled={submittingQr || utrNumber.trim().length < 6}
                    className="w-full py-3.5 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition-all"
                  >
                    {submittingQr ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <span>I Have Paid • Submit Request</span>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GATEWAY POLLING MODAL */}
      <AnimatePresence>
        {pollingActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 text-neutral-900 shadow-2xl text-center border border-neutral-200 relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center mx-auto mb-5 text-purple-600">
                <Loader2 className="animate-spin text-purple-600" size={28} />
              </div>

              <h3 className="text-base sm:text-lg font-black uppercase text-neutral-900 mb-1">
                {pollingTimedOut ? (
                  <span className="text-red-600">Verification Timed Out</span>
                ) : (
                  <>Verifying <span className="text-purple-600">Payment</span></>
                )}
              </h3>

              <p className="text-xs text-neutral-600 leading-relaxed mb-6 font-medium">
                {pollingTimedOut
                  ? 'Payment verification timed out. If your funds were deducted, please reach out to support with your Order ID.'
                  : "We're confirming your transaction. Please do not close or refresh this page."}
              </p>

              {pollingOrderId && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 mb-6 text-[11px] font-mono text-neutral-500">
                  Order ID: <span className="font-bold text-neutral-800 select-all">{pollingOrderId}</span>
                </div>
              )}

              <button
                onClick={() => {
                  setPollingActive(false);
                  setPollingOrderId(null);
                  setPollingTimedOut(false);
                }}
                className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
              >
                {pollingTimedOut ? 'Close & Return' : 'Cancel & Return to Wallet'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
