import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { roleByKey } from '../utils/authRoles';
import './landing.css';

const paths = {
  arrow: 'M5 12h14m-5-5 5 5-5 5', check: 'm5 12 4 4L19 6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h5',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h2m4 0h2m-8 4h2',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-5',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  doctor: 'M5 3v5a5 5 0 0 0 10 0V3M3 3h4m6 0h4m-7 10v3a5 5 0 0 0 10 0v-3m2-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  hospital: 'M4 22V4h16v18M9 22v-5h6v5M9 9h6m-3-3v6M2 22h20',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',
  lock: 'M6 10V7a6 6 0 0 1 12 0v3M5 10h14v12H5Zm7 5v3',
  menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M6 18 18 6',
};
function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Brand() {
  return <span className="home-brand"><span className="home-brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M13 5a3 3 0 0 1 6 0v8h8a3 3 0 1 1 0 6h-8v8a3 3 0 1 1-6 0v-8H5a3 3 0 0 1 0-6h8Z" stroke="currentColor" strokeWidth="2" /><path d="m10 16 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>MediVault<span className="home-brand-dot">.</span></span>;
}
const previewTabs = ['Records', 'Appointments', 'AI assistant'];
function WorkspacePreview() {
  const [tab, setTab] = useState(0);
  const tabRefs = useRef([]);
  const selectTab = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % previewTabs.length;
    if (event.key === 'ArrowLeft') next = (index + previewTabs.length - 1) % previewTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = previewTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault(); setTab(next); tabRefs.current[next]?.focus();
  };
  return (
    <div className="home-preview-wrap">
      <div className="home-preview-caption"><span className="home-live-dot" /> A little look inside <span>ILLUSTRATIVE PREVIEW</span></div>
      <div className="home-workspace">
        <div className="home-workspace-bar"><Brand /><span className="home-example-tag">Sample patient</span><span className="home-avatar">JD</span></div>
        <div className="home-workspace-body">
          <div className="home-preview-greeting"><div><span>YOUR PERSONAL HEALTH SPACE</span><h2>Good morning, Jamie<span>.</span></h2><p>Everything you need, a little closer.</p></div><span className="home-greeting-symbol"><Icon name="spark" size={25} /></span></div>
          <div className="home-preview-metrics"><div><Icon name="file" /><strong>12<span>Health records</span></strong></div><div><Icon name="calendar" /><strong>02<span>Appointments</span></strong></div><div><Icon name="shield" /><strong>You<span>Control access</span></strong></div></div>
          <div className="home-preview-tabs" role="tablist" aria-label="Explore the sample dashboard">
            {previewTabs.map((name, index) => <button key={name} ref={el => { tabRefs.current[index] = el; }} id={`preview-tab-${index}`} role="tab" type="button" aria-selected={tab === index} aria-controls="home-preview-panel" tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => selectTab(event, index)}>{name}</button>)}
          </div>
          <div className="home-preview-panel" id="home-preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${tab}`} tabIndex={0}>
            {tab === 0 && <><div className="home-panel-heading"><h3>Recent records</h3><span>Shared by your care team</span></div>{[{ name: 'Blood test results', type: 'Lab report', date: 'Oct 20', tone: 'lilac' }, { name: 'Annual health review', type: 'Consultation', date: 'Oct 12', tone: 'sage' }, { name: 'Your prescription', type: 'Prescription', date: 'Oct 12', tone: 'peach' }].map(record => <div className="home-record" key={record.name}><span className={`home-record-icon ${record.tone}`}><Icon name="file" size={18} /></span><div><strong>{record.name}</strong><span>{record.type}</span></div><time>{record.date}</time><Icon name="lock" size={14} /></div>)}</>}
            {tab === 1 && <><div className="home-panel-heading"><h3>Coming up next</h3><span>Your care, on the calendar</span></div><div className="home-sample-appointment"><div className="home-date-tile"><span>NOV</span><strong>12</strong></div><div><strong>Follow-up consultation</strong><span>Dr. Taylor · General medicine</span><span>10:00 AM · 30 minutes</span></div><span className="home-status">Confirmed</span></div><p className="home-preview-note"><Icon name="calendar" size={16} /> Request a visit. Keep track of what’s next.</p></>}
            {tab === 2 && <><div className="home-panel-heading"><h3>A little more clarity</h3><span>Answers with sources</span></div><div className="home-sample-question">What does my latest lab report say?</div><div className="home-sample-answer"><Icon name="spark" size={18} /><div><p>Your report lists an HbA1c of <strong>6.4%</strong>. You can open the source to see it in context.</p><span className="home-citation"><Icon name="file" size={12} /> Blood test results · Source 1</span></div></div><p className="home-ai-note">Explains your records. Does not replace medical advice.</p></>}
          </div>
        </div>
        <div className="home-workspace-foot"><Icon name="lock" size={13} /> A private space for your health story <span>Example data only</span></div>
      </div>
      <div className="home-preview-stamp"><span><Icon name="shield" size={20} /></span><div><strong>Your records. Your say.</strong><p>Manage who can access your information.</p></div></div>
    </div>
  );
}
const roles = [
  { role: 'patient', icon: 'user', label: 'For patients', title: 'Feel more in control.', description: 'Find your records, track your vitals, request appointments, and manage who has access.', link: 'Create a patient account', id: 'patients' },
  { role: 'doctor', icon: 'doctor', label: 'For doctors', title: 'See the fuller picture.', description: 'Review records shared with you, upload reports, and manage your patient appointments.', link: 'Join as a doctor', id: 'providers' },
  { role: 'hospital', icon: 'hospital', label: 'For hospitals', title: 'Keep care connected.', description: 'Upload patient documents, manage appointments, and coordinate access through your hospital workspace.', link: 'Register your hospital', id: 'hospitals' },
];
export default function LandingPage() {
  const location = useLocation();
  const { isAuthenticated, role } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const dashboardPath = roleByKey(role)?.dashboardPath || '/login';
  useEffect(() => {
    const id = location.state?.scrollTo;
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [location.state]);
  const closeMenu = () => setMenuOpen(false);
  const onMenuKeyDown = event => {
    if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
  };
  return (
    <div className="medivault-home">
      <a className="home-skip" href="#home-main">Skip to content</a>
      <header className="home-header" onKeyDown={onMenuKeyDown}>
        <div className="home-container home-nav">
          <Link to="/" aria-label="MediVault home"><Brand /></Link>
          <button className="home-menu-toggle" type="button" ref={menuButton} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="home-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} size={24} /></button>
          <nav className={`home-navigation${menuOpen ? ' is-open' : ''}`} id="home-navigation" aria-label="Main navigation">
            <div className="home-nav-links"><a href="#flow" onClick={closeMenu}>How it works</a><a href="#patients" onClick={closeMenu}>For patients</a><a href="#providers" onClick={closeMenu}>For providers</a></div>
            <div className="home-nav-actions">{isAuthenticated ? <Link className="home-button home-button-primary" to={dashboardPath}>Go to dashboard <Icon name="arrow" size={16} /></Link> : <><Link className="home-sign-in" to="/login">Sign in</Link><Link className="home-button home-button-primary home-nav-cta" to="/register">Create an account <Icon name="arrow" size={16} /></Link></>}</div>
          </nav>
        </div>
      </header>
      <main id="home-main">
        <section className="home-hero home-container" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <div className="home-eyebrow"><span /> YOUR HEALTH, CONNECTED</div>
            <h1 id="home-title">Your health records.<br /><span>One clear place.</span></h1>
            <p>Less searching. More understanding. Keep your medical records together, connect with your care team, and make sense of what comes next.</p>
            <div className="home-hero-actions"><Link className="home-button home-button-primary" to={isAuthenticated ? dashboardPath : '/register'}>{isAuthenticated ? 'Open your dashboard' : 'Create an account'}<Icon name="arrow" size={18} /></Link><a className="home-text-link" href="#flow">See how it works <span>↗</span></a></div>
            <div className="home-hero-assurance"><Icon name="shield" size={17} /><span>Your information belongs in your hands.</span></div>
          </div>
          <WorkspacePreview />
        </section>
        <div className="home-principles home-container" aria-label="MediVault capabilities"><span><Icon name="lock" /> Encrypted document storage</span><span><Icon name="shield" /> Access you control</span><span><Icon name="calendar" /> Care you can plan</span><span><Icon name="spark" /> Answers with sources</span></div>
        <section className="home-roles home-container" id="features" aria-labelledby="home-roles-title">
          <div className="home-section-heading"><div><span className="home-kicker">ONE PLATFORM. EVERY SIDE OF CARE.</span><h2 id="home-roles-title">A place for everyone<br />in your care story.</h2></div><p>Different roles. A shared goal.<br />The right information, closer at hand.</p></div>
          <div className="home-role-grid">{roles.map((item, index) => <article className={`home-role home-role-${item.role}`} id={item.id} key={item.role}><div className="home-role-top"><span className="home-role-icon"><Icon name={item.icon} size={24} /></span><span>{item.label}</span><span className="home-role-number">0{index + 1}</span></div><h3>{item.title}</h3><p>{item.description}</p><Link to={`/register/${item.role}`}>{item.link}<Icon name="arrow" size={18} /></Link></article>)}</div>
        </section>
        <section className="home-how" id="flow" aria-labelledby="home-how-title">
          <div className="home-container">
            <div className="home-section-heading"><div><span className="home-kicker">LESS FRICTION. MORE CLARITY.</span><h2 id="home-how-title">From scattered records<br />to a clearer picture.</h2></div><p>Simple tools for the everyday parts<br />of looking after your health.</p></div>
            <div className="home-how-grid"><div className="home-record-story"><div className="home-story-header"><span><Icon name="file" size={19} /> YOUR HEALTH STORY</span><span>All together</span></div><div className="home-story-timeline"><div><span className="home-timeline-dot" /><small>01 · KEEP IT TOGETHER</small><h3>A home for your records.</h3><p>Your doctor or hospital uploads reports to your vault, so you can find and download them in one place.</p></div><div><span className="home-timeline-dot" /><small>02 · STAY IN THE LOOP</small><h3>Know what’s coming next.</h3><p>Request appointments, follow confirmations, and keep track of your own vital measurements.</p></div><div><span className="home-timeline-dot" /><small>03 · UNDERSTAND MORE</small><h3>Ask your records a question.</h3><p>Get AI explanations with links to the source documents, so you can check the details yourself.</p></div></div></div><div className="home-clarity-card"><span className="home-clarity-icon"><Icon name="spark" size={28} /></span><span className="home-kicker">A LITTLE HELP MAKING SENSE OF IT</span><h3>Bring your questions.<br />Find the source.</h3><p>Ask about a report in everyday language. MediVault looks through the records you’re allowed to access and shows where its answer came from.</p><div className="home-clarity-example"><span>You could ask</span><p>“What does my latest lab report say?”</p><span className="home-citation"><Icon name="file" size={13} /> Answer linked to your record</span></div><small>AI helps explain information. Your care team helps you make medical decisions.</small></div></div>
          </div>
        </section>
        <section className="home-access home-container" aria-labelledby="home-access-title"><div className="home-access-art" aria-hidden="true"><div className="home-access-orbit"><span className="home-orbit-icon home-orbit-file"><Icon name="file" size={24} /></span><span className="home-orbit-icon home-orbit-doctor"><Icon name="doctor" size={24} /></span><span className="home-orbit-icon home-orbit-hospital"><Icon name="hospital" size={24} /></span><div className="home-access-center"><Icon name="shield" size={48} /></div></div><span className="home-access-label"><Icon name="check" size={15} /> Shared on your terms</span></div><div className="home-access-copy"><span className="home-kicker">BUILT AROUND YOUR SAY</span><h2 id="home-access-title">Your care is personal.<br />Your access should be, too.</h2><p>Sharing records should be a choice you can see and manage.</p><ul><li><Icon name="check" /> Review and approve access requests.</li><li><Icon name="check" /> Revoke access when you need to.</li><li><Icon name="check" /> Check who accessed your records and when.</li></ul><Link className="home-text-link" to="/register/patient">Start with your own workspace <Icon name="arrow" size={18} /></Link></div></section>
        <section className="home-cta home-container" id="cta" aria-labelledby="home-cta-title"><div><span className="home-kicker">A CLEARER PLACE TO START</span><h2 id="home-cta-title">Make room for better care.</h2><p>Your records, your appointments, your next step. Together.</p></div><Link className="home-button home-button-primary" to={isAuthenticated ? dashboardPath : '/register'}>{isAuthenticated ? 'Go to dashboard' : 'Find your workspace'}<Icon name="arrow" size={18} /></Link></section>
      </main>
      <footer className="home-footer home-container"><div className="home-footer-top"><Link to="/" aria-label="MediVault home"><Brand /></Link><p>A clearer connection to your health.</p><nav aria-label="Footer navigation"><Link to="/login">Sign in</Link><Link to="/register/patient">Patients</Link><Link to="/register/doctor">Doctors</Link><Link to="/register/hospital">Hospitals</Link></nav></div><div className="home-footer-bottom"><span>© {new Date().getFullYear()} MediVault</span><span>Built with care. Designed around you.</span></div></footer>
    </div>
  );
}
