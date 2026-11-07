// `color` defaults to teal for callers outside the new dashboard shell.
// Dashboard modals pass the plum accent explicitly.
export default function VerifiedStamp({ size = 180, variant = 'badge', color = '#007f8c' }) {
  const uid = `sv${size}`;

  if (variant === 'banner') {
    return (
      <svg width={size * 1.8} height={size * 0.35} viewBox="0 0 400 70" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
        <rect x="0" y="0" width="400" height="70" rx="8" fill={color} />
        <rect x="2" y="2" width="396" height="66" rx="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <g transform="translate(15, 12)">
          <path d="M25 3L5 12v13c0 12.5 8.5 24.2 20 27.4C36.5 49.2 45 37.5 45 25V12L25 3z" fill="white" opacity="0.9" />
          <polyline points="14,25 22,33 37,17" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
        <text x="75" y="28" fontSize="18" fontWeight="900" fontFamily="'Plus Jakarta Sans','Segoe UI',sans-serif" fill="white" letterSpacing="2">WELLNEST</text>
        <text x="75" y="48" fontSize="11" fontWeight="600" fontFamily="'Plus Jakarta Sans','Segoe UI',sans-serif" fill="rgba(255,255,255,0.85)" letterSpacing="3">VERIFIED DOCUMENT</text>
        <text x="370" y="42" fontSize="10" fill="rgba(255,255,255,0.6)" textAnchor="end">✓</text>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 220 220">
      <defs>
        <filter id={`ink${uid}`} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.88" numOctaves="4" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <clipPath id={`cl${uid}`}><circle cx="110" cy="110" r="62" /></clipPath>
        <path id={`ta${uid}`} d="M 20,110 A 90,90 0 0,1 200,110" />
        <path id={`ba${uid}`} d="M 200,110 A 90,90 0 0,1 20,110" />
      </defs>
      <circle cx="110" cy="110" r="107" fill="none" stroke={color} strokeWidth="5" filter={`url(#ink${uid})`} />
      <circle cx="110" cy="110" r="98" fill="none" stroke={color} strokeOpacity="0.65" strokeWidth="1.8" strokeDasharray="5 3.5" filter={`url(#ink${uid})`} />
      <circle cx="110" cy="110" r="70" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1.2" filter={`url(#ink${uid})`} />
      <text fontSize="13" fontWeight="900" fontFamily="'Plus Jakarta Sans','Segoe UI',sans-serif" fill={color} letterSpacing="7.5" filter={`url(#ink${uid})`}>
        <textPath href={`#ta${uid}`} startOffset="50%" textAnchor="middle">WELLNEST</textPath>
      </text>
      <text fontSize="10" fontWeight="800" fontFamily="'Plus Jakarta Sans','Segoe UI',sans-serif" fill={color} letterSpacing="4" filter={`url(#ink${uid})`}>
        <textPath href={`#ba${uid}`} startOffset="50%" textAnchor="middle">VERIFIED DOCUMENT</textPath>
      </text>
      <text x="25" y="117" fontSize="10" fill={color} textAnchor="middle" filter={`url(#ink${uid})`}>✦</text>
      <text x="195" y="117" fontSize="10" fill={color} textAnchor="middle" filter={`url(#ink${uid})`}>✦</text>
      <g transform="translate(85, 82)" filter={`url(#ink${uid})`}>
        <path d="M25 3L5 12v13c0 12.5 8.5 24.2 20 27.4C36.5 49.2 45 37.5 45 25V12L25 3z" fill={color} opacity="0.7" />
        <polyline points="14,25 22,33 37,17" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}
