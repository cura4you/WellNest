import BrandLogo from './brand/BrandLogo';

export default function Footer() {
    return (
        <footer className="footer">
            <div className="container footer-inner">
                <div className="footer-logo">
                    <BrandLogo />
                </div>
                <p className="footer-copy">MediVault &copy; 2026 &mdash; Secure Medical Records Platform</p>
                <p className="footer-sub">Built with care for patients everywhere</p>
            </div>
        </footer>
    );
}
