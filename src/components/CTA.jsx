import { Link } from 'react-router-dom';

export default function CTA() {
    return (
        <section className="section cta-section" id="cta">
            <div className="container">
                <div className="cta-box">
                    <h2>Ready to take <span className="accent">control</span> of your medical records?</h2>
                    <p>Join MediVault and experience what patient-first healthcare data management feels like.</p>
                    <div className="cta-buttons">
                        <Link to="/register/patient" className="btn-cta-primary">Get Started Free</Link>
                        <Link to="/login/hospital" className="btn-cta-outline">Hospital Login</Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
