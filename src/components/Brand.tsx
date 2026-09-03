/** The app's own marks. Kept here so every page draws the same logo. */

/** Telegram's paper plane, drawn as a single path so it inherits currentColor. */
export function TelegramGlyph({
  className = 'w-5 h-5',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M21.94 4.6l-3.02 14.25c-.23 1.01-.83 1.26-1.68.78l-4.64-3.42-2.24 2.16c-.25.25-.46.46-.94.46l.33-4.73L18.36 6.3c.37-.33-.08-.51-.58-.18L6.15 13.4l-4.7-1.47c-1.02-.32-1.04-1.02.21-1.51L20.63 3.1c.85-.31 1.6.2 1.31 1.5z" />
    </svg>
  );
}

/**
 * The app mark: a rounded gradient tile holding the paper plane. Sized by the
 * caller so the sidebar, header and hero can all share it.
 */
export function AppLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* A soft highlight so the tile does not read as a flat block. */}
      <span
        className="pointer-events-none absolute -left-1/4 -top-1/2 h-full w-full rounded-full bg-white/25 blur-md"
        aria-hidden="true"
      />
      <TelegramGlyph
        className="relative text-white"
        style={{ width: size * 0.55, height: size * 0.55 }}
      />
    </div>
  );
}
