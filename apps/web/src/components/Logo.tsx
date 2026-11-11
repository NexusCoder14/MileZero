export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="13" fill="var(--primary)" />
      <circle cx="32" cy="32" r="14" fill="none" stroke="var(--accent)" strokeWidth="6.5" />
      <path d="M7 50L17 50L24 43" fill="none" stroke="var(--bg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 21L47 14L57 14" fill="none" stroke="var(--bg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={30} />
      <span className="wordmark-text">Mile<span className="wordmark-zero">Zero</span></span>
    </span>
  );
}
