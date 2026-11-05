import './brand.css';

/** Approved identity: P8 tonal care petals with the W1 modern wordmark. */
export default function BrandLogo({ compact = false, className = '' }) {
  return (
    <span className={`brand-logo${compact ? ' is-compact' : ''} ${className}`.trim()}>
      <svg className="brand-logo-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        {[0, 90, 180, 270].map((angle, index) => (
          <path
            key={angle}
            d="M29.5 28.5C18 29 10.5 23 12.5 14.5C14.5 6 23 8 26.5 15C28.5 19.5 29.5 24 29.5 28.5Z"
            transform={`rotate(${angle} 32 32)`}
            fill="currentColor"
            opacity={index % 2 ? 0.58 : 1}
          />
        ))}
      </svg>
      {!compact && <span className="brand-logo-wordmark">Medi<span className="brand-logo-vault">Vault</span></span>}
    </span>
  );
}
