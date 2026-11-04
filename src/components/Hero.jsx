import { Link } from 'react-router-dom';

const STATS = [
    { value: '256-bit', label: 'AES encryption, always' },
    { value: 'Instant', label: 'break-glass emergency access' },
    { value: '100%', label: 'patient-owned, fully auditable' },
];

const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function Hero() {
    return (
        <section className="hero" id="hero">
            <div className="hero-text">
                <div className="hero-eyebrow">Now with AI-cited chat over your records</div>

                <h1 className="hero-headline">
                    Your medical records, <span className="accent">finally</span> under your control.
                </h1>

                <p className="hero-description">
                    One encrypted vault for every report, prescription, and scan — shared on your terms,
                    understood in plain English, and available the instant an emergency won't wait.
                </p>

                <div className="hero-ctas">
                    <Link to="/register/patient" className="btn btn-primary btn-lg">Get started free</Link>
                    <a href="#flow" className="btn btn-outline btn-lg" onClick={scrollTo('flow')}>
                        See how it works
                    </a>
                </div>
            </div>

            <div className="hero-stats">
                {STATS.map((stat, i) => (
                    <div key={i} className="hero-stat">
                        <div className="hero-stat-value">{stat.value}</div>
                        <div className="hero-stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}
