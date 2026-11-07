import { useEffect, useRef } from 'react';

const FEATURES = [
    {
        iconClass: 'fc-blue',
        icon: (
            <svg viewBox="0 0 32 32" fill="none">
                <path d="M16 4L5 9v7c0 6 4.7 11.5 11 13 6.3-1.5 11-7 11-13V9L16 4z"
                    stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Patient Controlled Records',
        desc: 'Patients fully own and manage their medical history. Grant or revoke access to anyone, anytime.',
    },
    {
        iconClass: 'fc-teal',
        icon: (
            <svg viewBox="0 0 32 32" fill="none">
                <rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" strokeWidth="2" />
                <path d="M11 16l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Secure Medical Storage',
        desc: 'Encrypted digital vault for all health reports. AES-256 encryption ensures your data is always locked tight.',
    },
    {
        iconClass: 'fc-red',
        dark: true,
        icon: (
            <svg viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2" />
                <path d="M16 10v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        title: 'Emergency Access Protocol',
        desc: 'Doctors get 24-hour read-only access to critical records in emergencies — blood group, allergies, medications.',
    },
    {
        iconClass: 'fc-blue',
        icon: (
            <svg viewBox="0 0 32 32" fill="none">
                <rect x="4" y="8" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M10 8V6a2 2 0 012-2h8a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
                <path d="M16 14v4M14 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        title: 'Hospital Integration',
        desc: 'Hospitals upload reports directly into patient vaults. Seamless transfers with full consent workflows.',
    },
    {
        iconClass: 'fc-teal',
        icon: (
            <svg viewBox="0 0 32 32" fill="none">
                <path d="M6 8h20M6 14h20M6 20h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        title: 'Transparent Audit Logs',
        desc: 'Every record access is logged and visible to the patient. Immutable, tamper-proof — not even admins can delete entries.',
    },
    {
        iconClass: 'fc-purple',
        icon: (
            <svg viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
                <path d="M5 26c0-5 4.5-9 11-9s11 4 11 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        title: 'Universal Medical Identity',
        desc: 'A single patient profile accessible across hospitals and clinics. One identity, all your records, everywhere you go.',
    },
];

export default function Features() {
    const cardRefs = useRef([]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -30px 0px' }
        );
        cardRefs.current.forEach((el) => { if (el) observer.observe(el); });
        return () => observer.disconnect();
    }, []);

    return (
        <section className="section features-section" id="features">
            <div className="container">
                <div className="section-header">
                    <span className="section-tag">Core Capabilities</span>
                    <h2>Everything WellNest Offers</h2>
                    <p>Medical-grade software built around people — patients, doctors, and hospitals alike.</p>
                </div>

                <div className="features-grid">
                    {FEATURES.map((f, i) => (
                        <div
                            key={i}
                            className={`feature-card${f.dark ? ' feature-card-dark' : ''}`}
                            ref={(el) => (cardRefs.current[i] = el)}
                        >
                            <div className={`fc-icon ${f.iconClass}`}>{f.icon}</div>
                            <h3>{f.title}</h3>
                            <p>{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
