import './brand.css';

/** Shared vector identity. The M folds into a V inside a protective vault shield. */
export default function BrandLogo({ compact = false, className = '' }) {
  return (
    <span className={`brand-logo${compact ? ' is-compact' : ''} ${className}`.trim()}>
      <svg className="brand-logo-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M24 3.5c5.2 3.5 10.7 5.5 17 6.5v12.4c0 9.5-6.1 17-17 22.1C13.1 39.4 7 31.9 7 22.4V10c6.3-1 11.8-3 17-6.5Z" fill="currentColor" />
        <path d="M15 29V17l9 8 9-8v12" stroke="var(--brand-cutout, #fff)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="brand-logo-wordmark">MediVault<span className="brand-logo-period">.</span></span>}
    </span>
  );
}
