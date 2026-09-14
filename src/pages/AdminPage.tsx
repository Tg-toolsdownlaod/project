import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Save, ShieldCheck } from 'lucide-react';

import { Tabs } from '@/components/Tabs';
import { supabase } from '@/lib/supabase';
import { approvePayment, rejectPayment } from '@/lib/backend';
import type { PaymentSubmission, PricingTier, SubscriptionRow } from '@/lib/types';
import { formatTimeAgo } from '@/lib/utils';

type AdminTab = 'payments' | 'tiers' | 'subscriptions';

/** Rendered only when the signed-in account's profiles.is_admin is true (see App.tsx). */
export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('payments');

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={(key) => setTab(key as AdminTab)}
        tabs={[
          { key: 'payments', label: 'Payments', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          { key: 'tiers', label: 'Pricing Tiers', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          { key: 'subscriptions', label: 'Subscriptions', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
        ]}
      />
      {tab === 'payments' && <PaymentsPanel />}
      {tab === 'tiers' && <TiersPanel />}
      {tab === 'subscriptions' && <SubscriptionsPanel />}
    </div>
  );
}

function PaymentsPanel() {
  const [rows, setRows] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from('payment_submissions')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(100);
    if (loadError) setError('Could not load payment claims.');
    setRows((data as PaymentSubmission[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    setError('');
    try {
      if (action === 'approve') await approvePayment(id);
      else await rejectPayment(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the decision.');
    }
    setBusyId(null);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}
      {rows.length === 0 && <p className="py-10 text-center text-xs text-dark-500">No payment claims yet.</p>}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3 rounded-xl border border-dark-800 bg-dark-900/60 p-3">
          {row.screenshot_url && (
            <a href={row.screenshot_url} target="_blank" rel="noreferrer">
              <img src={row.screenshot_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
            </a>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{row.email || row.user_id}</p>
            <p className="text-xs text-dark-500">
              {row.tier} · ${row.amount} · {formatTimeAgo(row.submitted_at)}
              {row.aba_trx_id && ` · ABA ${row.aba_trx_id}`}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              row.status === 'approved'
                ? 'bg-success-500/10 text-success-400'
                : row.status === 'rejected'
                ? 'bg-error-500/10 text-error-400'
                : 'bg-warning-500/10 text-warning-400'
            }`}
          >
            {row.status}
          </span>
          {row.status === 'pending' && (
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => decide(row.id, 'approve')}
                disabled={busyId === row.id}
                className="flex items-center gap-1 rounded-lg bg-success-500/10 px-2.5 py-1.5 text-xs font-medium text-success-400 transition-colors hover:bg-success-500/20 disabled:opacity-50"
              >
                {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve
              </button>
              <button
                onClick={() => decide(row.id, 'reject')}
                disabled={busyId === row.id}
                className="flex items-center gap-1 rounded-lg bg-error-500/10 px-2.5 py-1.5 text-xs font-medium text-error-400 transition-colors hover:bg-error-500/20 disabled:opacity-50"
              >
                <XCircle className="h-3 w-3" /> Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TiersPanel() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('pricing_tiers').select('*').order('price', { ascending: true });
      setTiers((data as PricingTier[]) || []);
      setLoading(false);
    })();
  }, []);

  const update = (key: string, field: keyof PricingTier, value: string | number | boolean) => {
    setTiers((prev) => prev.map((t) => (t.key === key ? { ...t, [field]: value } : t)));
  };

  const save = async (tier: PricingTier) => {
    setSavingKey(tier.key);
    setError('');
    const { error: saveError } = await supabase
      .from('pricing_tiers')
      .update({
        price: tier.price,
        months: tier.months,
        monthly_quota: tier.monthly_quota,
        label_km: tier.label_km,
        label_en: tier.label_en,
        pitch_km: tier.pitch_km,
        pitch_en: tier.pitch_en,
        active: tier.active,
      })
      .eq('key', tier.key);
    if (saveError) setError('Could not save this tier.');
    setSavingKey(null);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}
      {tiers.map((tier) => (
        <div key={tier.key} className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-white">{tier.key}</span>
            <span className="rounded bg-dark-800 px-2 py-0.5 text-[10px] uppercase text-dark-400">{tier.capability}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumField label="Price ($)" value={tier.price} onChange={(v) => update(tier.key, 'price', v)} />
            <NumField label="Months" value={tier.months} onChange={(v) => update(tier.key, 'months', v)} />
            <NumField
              label="Monthly quota"
              value={tier.monthly_quota ?? ''}
              placeholder="unlimited"
              onChange={(v) => update(tier.key, 'monthly_quota', v)}
            />
            <label className="flex items-end gap-2 pb-2 text-xs text-dark-400">
              <input
                type="checkbox"
                checked={tier.active}
                onChange={(e) => update(tier.key, 'active', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-dark-700 bg-dark-800 text-primary-500"
              />
              Active
            </label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <TextField label="Label (EN)" value={tier.label_en} onChange={(v) => update(tier.key, 'label_en', v)} />
            <TextField label="Label (KM)" value={tier.label_km} onChange={(v) => update(tier.key, 'label_km', v)} />
            <TextField label="Pitch (EN)" value={tier.pitch_en || ''} onChange={(v) => update(tier.key, 'pitch_en', v)} />
            <TextField label="Pitch (KM)" value={tier.pitch_km || ''} onChange={(v) => update(tier.key, 'pitch_km', v)} />
          </div>
          <button
            onClick={() => save(tier)}
            disabled={savingKey === tier.key}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {savingKey === tier.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
        </div>
      ))}
    </div>
  );
}

function SubscriptionsPanel() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('subscriptions').select('*').order('updated_at', { ascending: false });
      setRows((data as SubscriptionRow[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="py-10 text-center text-xs text-dark-500">No subscribers yet.</p>}
      {rows.map((row) => {
        const active = row.expires_at ? new Date(row.expires_at) > new Date() : false;
        return (
          <div key={row.user_id} className="flex items-center gap-3 rounded-xl border border-dark-800 bg-dark-900/60 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{row.email || row.user_id}</p>
              <p className="text-xs text-dark-500">
                {row.tier || '—'} ({row.capability || '—'}) · expires {row.expires_at ? formatTimeAgo(row.expires_at) : 'never'}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${active ? 'bg-success-500/10 text-success-400' : 'bg-dark-800 text-dark-400'}`}>
              {active ? 'active' : 'expired'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NumField({ label, value, onChange, placeholder }: { label: string; value: number | string; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-dark-500">{label}</label>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? (null as unknown as number) : Number(e.target.value))}
        className="w-full rounded-lg border border-dark-700 bg-dark-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary-500"
      />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-dark-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-dark-700 bg-dark-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary-500"
      />
    </div>
  );
}
