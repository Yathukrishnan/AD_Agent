// Shared brand platform icons (inline SVG, self-contained).
export function PlatformIcon({ p, size = 20 }: { p: string; size?: number }) {
  switch (p) {
    case "meta":
      return (<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#0866FF" strokeWidth="2.1" strokeLinecap="round"><path d="M2 15.5c0-4.5 1.9-8 4.7-8 2 0 3.3 1.8 5.3 5.2 2 3.4 3.3 5.2 5.3 5.2 2.5 0 4-3 4-6.4 0-3.7-1.7-6-4-6-2.4 0-4.4 2.4-6.6 6C7.8 14.6 5.8 17 3.6 17" /></svg>);
    case "facebook":
      return (<svg viewBox="0 0 24 24" width={size} height={size} fill="#1877F2"><path d="M24 12A12 12 0 1 0 10.13 23.85V15.47H7.08V12h3.05V9.36c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" /></svg>);
    case "instagram":
      return (<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#E1306C" strokeWidth="2"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1.1" fill="#E1306C" stroke="none" /></svg>);
    case "twitter":
      return (<svg viewBox="0 0 24 24" width={size} height={size}><rect width="24" height="24" rx="5" fill="#000" /><path fill="#fff" d="M17.53 4.5h2.9l-6.34 7.24L21.5 19.5h-5.6l-4.38-5.73-5.02 5.73H3.6l6.78-7.75L2.9 4.5h5.74l3.96 5.24L17.53 4.5Zm-1.02 13.2h1.6L8.02 6.2H6.3l10.2 11.5Z" /></svg>);
    case "google":
      return (<svg viewBox="0 0 24 24" width={size} height={size}><path fill="#4285F4" d="M23 12.25c0-.79-.07-1.55-.2-2.28H12v4.32h6.18a5.29 5.29 0 0 1-2.29 3.47v2.88h3.7C21.46 18.63 23 15.72 23 12.25z" /><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.59-2.78l-3.7-2.88c-1.03.69-2.35 1.1-3.89 1.1-2.99 0-5.52-2.02-6.43-4.73H1.75v2.97A11.5 11.5 0 0 0 12 23.5z" /><path fill="#FBBC05" d="M5.57 14.21a6.9 6.9 0 0 1 0-4.42V6.82H1.75a11.5 11.5 0 0 0 0 10.36l3.82-2.97z" /><path fill="#EA4335" d="M12 5.04c1.69 0 3.2.58 4.39 1.72l3.28-3.28A11.5 11.5 0 0 0 12 .5 11.5 11.5 0 0 0 1.75 6.82l3.82 2.97C6.48 7.06 9.01 5.04 12 5.04z" /></svg>);
    case "youtube":
      return (<svg viewBox="0 0 24 24" width={size} height={size}><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000" /><path d="M10 8.5 L16 12 L10 15.5 Z" fill="#fff" /></svg>);
    default:
      return null;
  }
}
