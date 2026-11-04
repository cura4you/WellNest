import { useState, useEffect, useRef, useCallback } from 'react';

const ROLES = [
    {
        id: 'patient',
        label: 'Patient',
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 18c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        ),
        steps: [
            { icon: '📝', title: 'Create Account', desc: 'Sign up and set up your secure MediVault profile.' },
            { icon: '📤', title: 'Upload Records', desc: 'Add your health records, lab reports, prescriptions, and documents.' },
            { icon: '🔑', title: 'Grant Doctor Access', desc: 'Give your doctor permission to view specific records.' },
            { icon: '🚨', title: 'Emergency Access Enabled', desc: "Critical data is available to ER doctors if you're incapacitated." },
            { icon: '📋', title: 'Monitor Audit Logs', desc: 'See exactly who accessed your records, when, and why.' },
        ],
    },
    {
        id: 'doctor',
        label: 'Doctor',
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M10 13v4M8 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        ),
        steps: [
            { icon: '🔍', title: 'Request Patient Access', desc: "Send a secure request to view a patient's medical records." },
            { icon: '✅', title: 'Receive Permission', desc: 'Patient grants access. Role-based permissions are enforced automatically.' },
            { icon: '📂', title: 'View Medical History', desc: 'Access the full record history, AI summaries, and past treatments.' },
            { icon: '🩺', title: 'Diagnose Confidently', desc: 'Make better decisions using complete, accurate medical context.' },
        ],
    },
    {
        id: 'hospital',
        label: 'Hospital',
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M7 18V13h6v5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M7 4h6M10 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        ),
        steps: [
            { icon: '🏥', title: 'Register Institution', desc: 'Onboard your hospital and verify your identity on the platform.' },
            { icon: '📥', title: 'Upload Patient Reports', desc: 'Directly add diagnostic reports into patient vaults after visits.' },
            { icon: '🔒', title: 'Securely Store Documents', desc: "All documents are encrypted and stored in the patient's own vault." },
            { icon: '🔗', title: 'Share with Authorized Doctors', desc: 'Affiliated doctors receive scoped access to relevant patient records only.' },
        ],
    },
];

const ROLE_CYCLE_MS = 5000;

export default function FlowSection() {
    const [activeRole, setActiveRole] = useState('patient');
    const [activeStep, setActiveStep] = useState(0);
    const stepTimerRef = useRef(null);
    const roleIdxRef = useRef(0);

    const getRoleSteps = useCallback((roleId) => {
        return ROLES.find((r) => r.id === roleId)?.steps ?? [];
    }, []);

    const runStepCycler = useCallback((roleId) => {
        clearInterval(stepTimerRef.current);
        const steps = getRoleSteps(roleId);
        const stepMs = Math.floor(ROLE_CYCLE_MS / steps.length);
        let idx = 0;
        setActiveStep(0);

        stepTimerRef.current = setInterval(() => {
            idx++;
            if (idx < steps.length) {
                setActiveStep(idx);
            } else {
                clearInterval(stepTimerRef.current);
                // Advance to next role
                roleIdxRef.current = (roleIdxRef.current + 1) % ROLES.length;
                const nextRole = ROLES[roleIdxRef.current].id;
                setActiveRole(nextRole);
                // runStepCycler called via useEffect when activeRole changes
            }
        }, stepMs);
    }, [getRoleSteps]);

    // When role changes, restart step cycler
    useEffect(() => {
        roleIdxRef.current = ROLES.findIndex((r) => r.id === activeRole);
        runStepCycler(activeRole);
        return () => clearInterval(stepTimerRef.current);
    }, [activeRole, runStepCycler]);

    const handleTabClick = (roleId) => {
        clearInterval(stepTimerRef.current);
        setActiveRole(roleId);
        setActiveStep(0);
        // The useEffect above will restart the cycler
    };

    const currentRole = ROLES.find((r) => r.id === activeRole);

    return (
        <section className="section flow-section" id="flow">
            <div className="container">
                <div className="section-header">
                    <span className="section-tag">How It Works</span>
                    <h2>Designed for Every Role</h2>
                    <p>MediVault adapts to how each person interacts with healthcare data — securely and transparently.</p>
                </div>

                {/* Role Tabs */}
                <div className="flow-tabs" role="tablist">
                    {ROLES.map((role) => (
                        <button
                            key={role.id}
                            className={`flow-tab${activeRole === role.id ? ' active' : ''}`}
                            data-role={role.id}
                            role="tab"
                            aria-selected={activeRole === role.id}
                            onClick={() => handleTabClick(role.id)}
                        >
                            {role.icon}
                            {role.label}
                        </button>
                    ))}
                </div>

                {/* Flow Panel */}
                <div className="flow-panels">
                    <div className="flow-panel active flow-panel-card">
                        <div className="flow-stepper">
                            {currentRole?.steps.map((step, i) => (
                                <div
                                    key={i}
                                    className={`flow-step${i === currentRole.steps.length - 1 ? ' last' : ''}${i === activeStep ? ' step-current' : ''}`}
                                >
                                    <div className={`step-bubble${i === activeStep ? ' step-active' : ''}`}>
                                        {i + 1}
                                    </div>
                                    {i < currentRole.steps.length - 1 && <div className="step-connector" />}
                                    <div className="step-body">
                                        <div className="step-icon">{step.icon}</div>
                                        <h4>{step.title}</h4>
                                        <p>{step.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
