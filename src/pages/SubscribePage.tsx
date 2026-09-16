import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  UploadCloud,
  Crown,
  Sparkles,
  Clock,
  ArrowLeft,
  LogOut,
} from 'lucide-react';

import { AppLogo } from '@/components/Brand';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import {
  submitPaymentClaim,
  cancelPaymentClaim,
  getSubscriptionStatus,
  attachPaymentScreenshot,
} from '@/lib/backend';
import type { PaymentSubmission, PricingTier } from '@/lib/types';

const FALLBACK_TIERS: PricingTier[] = [
  {
    key: 'basic_1m',
    capability: 'basic',
    price: 5,
    months: 1,
    monthly_quota: 30,
    label_km: 'មូលដ្ឋាន',
    label_en: 'Basic',
    pitch_km: 'ប្រើ userbot របស់ app ផ្ទាល់ — មិនចាំបាច់ភ្ជាប់គណនី Telegram ខ្លួនឯង',
    pitch_en: "Use the app's shared userbot — no Telegram account of your own to connect",
    active: true,
  },
  {
    key: 'pro_1m',
    capability: 'pro',
    price: 9,
    months: 1,
    monthly_quota: null,
    label_km: 'Pro',
    label_en: 'Pro',
    pitch_km: 'ភ្ជាប់គណនី Telegram ខ្លួនឯង + storage ខ្លួនឯង',
    pitch_en: 'Connect your own Telegram account and storage for private groups',
    active: true,
  },
];

/**
 * Shown instead of the app shell whenever the signed-in account has no
 * active subscription. Picks a plan, shows the QR + lets a screenshot be
 * attached as proof, then polls until the operator (or the ABA auto-confirm
 * path) approves it -- at which point `onApproved` lets App.tsx re-check
 * status and swap in the real app.
 */
export function SubscribePage({ onApproved }: { onApproved: () => void }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [pending, setPending] = useState<PaymentSubmission | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const [tierResult, submissionResult] = await Promise.all([
      supabase.from('pricing_tiers').select('*').eq('active', true).order('price', { ascending: true }),
      supabase
        .from('payment_submissions')
        .select('*')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(1),
    ]);
    if (tierResult.error || submissionResult.error) {
      setError(tierResult.error?.message || submissionResult.error?.message || t('subscribe.selectFailed'));
    }
    setTiers((tierResult.data as PricingTier[])?.length ? (tierResult.data as PricingTier[]) : FALLBACK_TIERS);
    const current = (submissionResult.data as PaymentSubmission[] | null)?.[0] ?? null;
    setPending(current);
    if (current) {
      const { data: qr } = await supabase
        .from('payment_qr_codes')
        .select('image_url')
        .eq('tier', current.tier)
        .maybeSingle();
      setQrUrl((qr as { image_url: string | null } | null)?.image_url ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // While a claim is pending, poll for the operator's decision (or an ABA
  // auto-confirm) so the screen advances with no manual refresh needed.
  useEffect(() => {
    if (!pending) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const status = await getSubscriptionStatus();
        if (status.subscribed) {
          if (pollRef.current) clearInterval(pollRef.current);
          onApproved();
          return;
        }
        const { data } = await supabase.from('payment_submissions').select('*').eq('id', pending.id).maybeSingle();
        const row = data as PaymentSubmission | null;
        if (row && row.status !== 'pending') {
          setPending(null);
          if (row.status === 'rejected') setError(t('subscribe.rejected'));
          load();
        }
      } catch {
        // A transient blip shouldn't stop polling -- the next tick retries.
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  const handleSelect = async (tierKey: string) => {
    setError('');
    setSelecting(true);
    try {
      const result = await submitPaymentClaim(tierKey);
      setPending(result.submission);
      const { data: qr } = await supabase
        .from('payment_qr_codes')
        .select('image_url')
        .eq('tier', tierKey)
        .maybeSingle();
      setQrUrl((qr as { image_url: string | null } | null)?.image_url ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('subscribe.selectFailed'));
    }
    setSelecting(false);
  };

  const handleScreenshot = async (file: File) => {
    if (!pending) return;
    setError('');
    setUploading(true);
    try {
      const path = `${pending.user_id}/${pending.id}-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('payment-proofs').getPublicUrl(path);
      await attachPaymentScreenshot(pending.id, pub.publicUrl);
      setPending({ ...pending, screenshot_url: pub.publicUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('subscribe.uploadFailed'));
    }
    setUploading(false);
  };

  const handleCancel = async () => {
    if (!pending) return;
    setError('');
    try {
      await cancelPaymentClaim(pending.id);
    } catch {
      // fall through -- the reload below will show the real state either way
    }
    setPending(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950">
        <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <AppLogo size={48} className="glow" />
          <div>
            <p className="text-base font-bold text-white">{t('subscribe.title')}</p>
            <p className="text-xs text-dark-500">{t('subscribe.tagline')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!pending ? (
          <div className="space-y-3">
            {tiers.map((tier) => (
              <button
                key={tier.key}
                onClick={() => handleSelect(tier.key)}
                disabled={selecting}
                className="w-full rounded-2xl border border-dark-800 bg-dark-900/60 p-5 text-left transition-colors hover:border-primary-500/50 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {tier.capability === 'pro' ? (
                      <Crown className="h-4 w-4 text-warning-400" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary-400" />
                    )}
                    <span className="text-sm font-bold text-white">{tier.label_en}</span>
                  </div>
                  <span className="text-lg font-bold text-white">
                    ${tier.price}
                    <span className="text-xs font-normal text-dark-500">/{tier.months}mo</span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-dark-400">{tier.pitch_en || tier.pitch_km}</p>
                <p className="mt-2 text-[11px] text-dark-500">
                  {tier.monthly_quota ? t('subscribe.quotaLimited').replace('{n}', String(tier.monthly_quota)) : t('subscribe.quotaUnlimited')}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dark-800 bg-dark-900/60 p-6 text-center">
            <button
              onClick={handleCancel}
              className="mb-4 flex items-center gap-1.5 text-xs text-dark-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t('subscribe.changePlan')}
            </button>

            {qrUrl ? (
              <img src={qrUrl} alt="Payment QR" className="mx-auto mb-4 h-56 w-56 rounded-xl bg-white p-2" />
            ) : (
              <div className="mx-auto mb-4 flex h-56 w-56 items-center justify-center rounded-xl border border-dashed border-dark-700 text-xs text-dark-500">
                {t('subscribe.noQr')}
              </div>
            )}

            <p className="mb-1 text-sm font-medium text-white">${pending.amount}</p>
            <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-dark-500">
              <Clock className="h-3.5 w-3.5 animate-pulse" /> {t('subscribe.waiting')}
            </p>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-dark-800 px-4 py-2.5 text-sm font-medium text-dark-300 transition-colors hover:bg-dark-700 hover:text-white">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {pending.screenshot_url ? t('subscribe.replaceScreenshot') : t('subscribe.attachScreenshot')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleScreenshot(e.target.files[0])}
              />
            </label>
            {pending.screenshot_url && (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-success-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t('subscribe.screenshotAttached')}
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => supabase.auth.signOut()}
          className="mx-auto mt-6 flex items-center gap-1.5 text-xs text-dark-500 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" /> {t('auth.signOut')}
        </button>
      </div>
    </div>
  );
}
