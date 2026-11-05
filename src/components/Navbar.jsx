import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from './brand/BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { roleByKey } from '../utils/authRoles';

const NAV_SECTIONS = ['features', 'flow', 'cta'];

export default function Navbar() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('');
    const navRightRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { isAuthenticated, role, logout } = useAuth();

    // Scroll-spy: highlight whichever section is actually in view, not just
    // whichever link was last clicked — so it stays correct on manual scroll too.
    // Off "/" there's nothing to observe; the active class is also gated on
    // pathname === '/' at render time below, so activeSection is simply
    // stale-but-unused rather than needing a reset here.
    useEffect(() => {
        if (location.pathname !== '/') return undefined;

        const sections = NAV_SECTIONS
            .map((id) => document.getElementById(id))
            .filter(Boolean);
        if (sections.length === 0) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                if (visible[0]) setActiveSection(visible[0].target.id);
            },
            { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
        );

        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, [location.pathname]);

    const closeMenu = () => {
        setMenuOpen(false);
    };

    const toggleMenu = () => {
        setMenuOpen((prev) => !prev);
    };

    // Keep body scroll locked when mobile menu is open.
    useEffect(() => {
        document.body.style.overflow = menuOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [menuOpen]);

    const scrollTo = (id) => (e) => {
        e.preventDefault();
        closeMenu();

        if (location.pathname !== '/') {
            navigate('/', { state: { scrollTo: id } });
            return;
        }

        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveSection(id); // instant feedback; the observer confirms once the scroll settles
    };

    const currentRole = roleByKey(role);
    const isNavActive = (id) => location.pathname === '/' && activeSection === id;

    const handleLogout = () => {
        logout();
        closeMenu();
        navigate('/');
    };

    return (
        <nav className="navbar" id="navbar">
            <div className="nav-inner">
                {/* Logo */}
                <Link to="/" className="nav-logo" aria-label="MediVault Home" onClick={closeMenu}>
                    <BrandLogo />
                </Link>

                {/* Hamburger */}
                <button
                    className={`nav-hamburger${menuOpen ? ' open' : ''}`}
                    onClick={toggleMenu}
                    aria-label="Toggle menu"
                    aria-expanded={menuOpen}
                >
                    <span /><span /><span />
                </button>

                {/* Right side */}
                <div className={`nav-right${menuOpen ? ' open' : ''}`} ref={navRightRef}>
                    <ul className="nav-links">
                        <li><a href="#features" className={isNavActive('features') ? 'is-active' : ''} onClick={scrollTo('features')}>Features</a></li>
                        <li><a href="#flow" className={isNavActive('flow') ? 'is-active' : ''} onClick={scrollTo('flow')}>How It Works</a></li>
                        <li><a href="#cta" className={isNavActive('cta') ? 'is-active' : ''} onClick={scrollTo('cta')}>About</a></li>
                    </ul>
                    <div className="nav-buttons">
                        {isAuthenticated ? (
                            <>
                                <Link to={currentRole?.dashboardPath || '/'} className="btn btn-outline" onClick={closeMenu}>
                                    Dashboard
                                </Link>
                                <button type="button" className="btn btn-primary" onClick={handleLogout}>Logout</button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="btn btn-outline" onClick={closeMenu}>Login</Link>
                                <Link to="/register" className="btn btn-primary" onClick={closeMenu}>Register</Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
