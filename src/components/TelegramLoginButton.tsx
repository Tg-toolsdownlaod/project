import { useEffect, useRef } from 'react';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_LOGIN_BOT_USERNAME as string | undefined;

export const telegramLoginConfigured = Boolean(BOT_USERNAME);

export interface TelegramAuthPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

/**
 * Renders Telegram's own "Log in with Telegram" widget, which replaces
 * itself with a real button once its script loads. Telegram signs whatever
 * the visitor approves and calls back into `onAuth` with it; the backend is
 * the one that actually verifies the signature (see telegramLogin.js) --
 * this component only wires the callback through.
 *
 * Renders nothing when VITE_TELEGRAM_LOGIN_BOT_USERNAME isn't set, so the
 * app still works with just email/password until that's configured.
 */
export function TelegramLoginButton({ onAuth }: { onAuth: (payload: TelegramAuthPayload) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!BOT_USERNAME || !container) return;

    window.onTelegramAuth = onAuth;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
      container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!BOT_USERNAME) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
