import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
