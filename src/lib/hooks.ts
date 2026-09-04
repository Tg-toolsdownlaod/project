import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { backendConfigured, checkHealth } from '@/lib/backend';
import type { DownloadSettings, TelegramSettings, R2Settings } from '@/lib/types';

export function useSettings() {
  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings | null>(null);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings | null>(null);
  const [r2Settings, setR2Settings] = useState<R2Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [dl, tg, r2] = await Promise.all([
        supabase.from('download_settings').select('*').maybeSingle(),
        supabase.from('telegram_settings').select('*').maybeSingle(),
        supabase.from('r2_settings').select('*').maybeSingle(),
      ]);

      if (dl.data) setDownloadSettings(dl.data as DownloadSettings);
      if (tg.data) setTelegramSettings(tg.data as TelegramSettings);
      if (r2.data) setR2Settings(r2.data as R2Settings);
      setLoading(false);
    })();
  }, []);

  return { downloadSettings, setDownloadSettings, telegramSettings, setTelegramSettings, r2Settings, setR2Settings, loading };
}

/**
 * Connection state for the three things that can be down: the userbot service,
 * Telegram itself, and R2. Polled so the header badge stays honest.
 */
export function useConnectionStatus(pollMs = 30000) {
  const [status, setStatus] = useState<{
    backend: boolean | null;
    telegram: boolean;
    r2: boolean;
  }>({ backend: null, telegram: false, r2: false });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!backendConfigured) {
        // Without a backend we can still report what the database believes.
        const [tg, r2] = await Promise.all([
          supabase.from('telegram_settings').select('connected').maybeSingle(),
          supabase.from('r2_settings').select('connected').maybeSingle(),
        ]);
        if (cancelled) return;
        setStatus({
          backend: false,
          telegram: Boolean((tg.data as { connected?: boolean } | null)?.connected),
          r2: Boolean((r2.data as { connected?: boolean } | null)?.connected),
        });
        return;
      }
      try {
        const health = await checkHealth();
        if (!cancelled) setStatus({ backend: true, telegram: health.telegram, r2: health.r2 });
      } catch {
        if (!cancelled) setStatus({ backend: false, telegram: false, r2: false });
      }
    };

    check();
    const timer = setInterval(check, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return status;
}
