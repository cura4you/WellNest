import { useState } from "react";

const BLUE = "#1A56DB";
const TEAL = "#0E9F9F";
const RED = "#E53E3E";
const GREEN = "#38A169";
const ORANGE = "#DD6B20";

const diagrams = [
  {
    id: "architecture",
    label: "System Architecture",
    emoji: "🏗️",
    color: BLUE,
  },
  {
    id: "roles",
    label: "User Roles & Access",
    emoji: "👥",
    color: TEAL,
  },
  {
    id: "transfer",
    label: "Hospital Transfer Flow",
    emoji: "🔄",
    color: ORANGE,
  },
  {
    id: "upload",
    label: "AI Summarizer Flow",
    emoji: "🤖",
    color: GREEN,
  },
  {
    id: "emergency",
    label: "Emergency Access",
    emoji: "🚨",
    color: RED,
  },
];

function Box({ text, sub, color = BLUE, width = 160, center = false }) {
  return (
    <div style={{
      background: color, color: "#fff", borderRadius: 10, padding: "10px 16px",
      width, textAlign: center ? "center" : "left", boxShadow: "0 3px 10px rgba(0,0,0,0.18)",
      fontWeight: 700, fontSize: 13, lineHeight: 1.3
    }}>
      {text}
      {sub && <div style={{ fontWeight: 400, fontSize: 11, marginTop: 4, opacity: 0.9 }}>{sub}</div>}
    </div>
  );
}

function Arrow({ dir = "down", label = "" }) {
  const isDown = dir === "down";
  const isRight = dir === "right";
  return (
    <div style={{
      display: "flex", flexDirection: isDown ? "column" : "row",
      alignItems: "center", gap: 2,
      margin: isDown ? "4px auto" : "auto 4px"
    }}>
      {label && <span style={{ fontSize: 10, color: "#666", maxWidth: isRight ? 60 : 100, textAlign: "center" }}>{label}</span>}
      <div style={{
        width: isDown ? 2 : 32, height: isDown ? 32 : 2,
        background: "#CBD5E0", position: "relative"
      }}>
        <div style={{
          position: "absolute",
          ...(isDown ? { bottom: -6, left: -4, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid #CBD5E0" }
            : { right: -6, top: -4, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #CBD5E0" })
        }} />
      </div>
    </div>
  );
}

function Pill({ text, color = "#EBF2FF", textColor = BLUE }) {
  return (
    <span style={{
      background: color, color: textColor, borderRadius: 20, padding: "3px 12px",
      fontSize: 11, fontWeight: 600, display: "inline-block"
    }}>{text}</span>
  );
}

function Section({ title, children, bg = "#F7F8FA" }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#4A5568", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      {children}
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div>
      <p style={{ color: "#4A5568", fontSize: 13, marginBottom: 20 }}>
        WellNest is a multi-role platform. All four user types interact with the same central encrypted data layer through role-specific interfaces with strictly enforced permissions.
      </p>

      {/* Central vault */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <div style={{
          background: "linear-gradient(135deg, #1A56DB, #0E9F9F)",
          color: "#fff", borderRadius: 14, padding: "14px 40px",
          fontWeight: 800, fontSize: 16, boxShadow: "0 4px 20px rgba(26,86,219,0.4)",
          textAlign: "center"
        }}>
          🔐 Document Vault
          <div style={{ fontWeight: 400, fontSize: 11, marginTop: 4 }}>AES-256 Encrypted · Patient-Controlled · Single Source of Truth</div>
        </div>
      </div>

      {/* Arrow down to AI + Transfer */}
      <div style={{ display: "flex", justifyContent: "center", gap: 60, marginBottom: 8 }}>
        <Arrow dir="down" />
        <Arrow dir="down" />
      </div>

      {/* AI + Transfer row */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 8 }}>
        <Box text="🤖 AI Summarizer" sub="Plain-language report summaries" color={GREEN} width={180} />
        <Box text="🔄 Transfer Engine" sub="Hospital switching & consent flows" color={ORANGE} width={180} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 100, marginBottom: 8 }}>
        <Arrow dir="down" />
        <Arrow dir="down" />
      </div>

      {/* Four dashboards */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 8 }}>
        {[
          { icon: "🧑‍⚕️", label: "Patient Dashboard", sub: "Owns & controls all data", color: BLUE },
          { icon: "👨‍⚕️", label: "Doctor Dashboard", sub: "Assigned patients only", color: TEAL },
          { icon: "🏥", label: "Hospital Dashboard", sub: "Own registry & doctors", color: ORANGE },
          { icon: "🛡️", label: "Admin Dashboard", sub: "Governance only, no medical content", color: "#6B46C1" },
        ].map(d => (
          <Box key={d.label} text={`${d.icon} ${d.label}`} sub={d.sub} color={d.color} width={155} center />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <div style={{ background: "#EDF2F7", borderRadius: 10, padding: "10px 24px", textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#4A5568", marginBottom: 6 }}>🔔 Notification Centre</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Patient alerts", "Doctor alerts", "Hospital alerts", "Admin alerts"].map(l => (
              <Pill key={l} text={l} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RolesDiagram() {
  const roles = [
    {
      icon: "🧑‍⚕️", name: "Patient", color: BLUE,
      can: ["Upload & manage all records", "Grant/revoke access to any party", "Request hospital transfers", "Book & manage appointments", "Get AI summaries of reports", "View full audit trail"],
      cannot: ["Access other patients' data"],
      badge: "Full Owner"
    },
    {
      icon: "👨‍⚕️", name: "Doctor", color: TEAL,
      can: ["View assigned patient records", "Write SOAP clinical notes", "Create e-prescriptions", "Use AI report summaries", "View patient health timeline"],
      cannot: ["Access unassigned patients", "Delete any patient record"],
      badge: "Verified Clinician"
    },
    {
      icon: "🏥", name: "Hospital", color: ORANGE,
      can: ["Manage own patient registry", "Handle record transfer requests", "Manage affiliated doctors", "View compliance reports"],
      cannot: ["Access other hospitals' patients", "Deny emergency access override"],
      badge: "Custodian"
    },
    {
      icon: "🛡️", name: "Admin", color: "#6B46C1",
      can: ["Verify doctors & hospitals", "View all audit logs", "Detect security anomalies", "Manage platform permissions"],
      cannot: ["Read patient medical content", "Delete audit log entries"],
      badge: "Governance Only"
    },
  ];

  return (
    <div>
      <p style={{ color: "#4A5568", fontSize: 13, marginBottom: 20 }}>
        Each role has strictly enforced permissions. No role can "see up" or "see across" — access is always role-scoped and patient-consented.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {roles.map(r => (
          <div key={r.name} style={{ background: "#fff", borderRadius: 12, border: `2px solid ${r.color}22`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
            <div style={{ background: r.color, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>{r.icon}</span>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{r.name}</div>
                <Pill text={r.badge} color="rgba(255,255,255,0.2)" textColor="#fff" />
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, marginBottom: 6, textTransform: "uppercase" }}>✅ Can</div>
                {r.can.map(c => <div key={c} style={{ fontSize: 12, color: "#2D3748", marginBottom: 3 }}>• {c}</div>)}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: RED, marginBottom: 6, textTransform: "uppercase" }}>🚫 Cannot</div>
                {r.cannot.map(c => <div key={c} style={{ fontSize: 12, color: "#2D3748", marginBottom: 3 }}>• {c}</div>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransferDiagram() {
  const steps = [
    { num: 1, actor: "Patient", text: "Opens Hospital Management → clicks 'Request Transfer'", color: BLUE },
    { num: 2, actor: "Patient", text: "Selects the destination hospital from registered list", color: BLUE },
    { num: 3, actor: "Patient", text: "Selects which records to include (all or specific documents)", color: BLUE },
    { num: 4, actor: "System", text: "Old hospital receives notification with 72-hour response window", color: "#718096" },
    { num: 5, actor: "Old Hospital", text: "Reviews and Approves / Partially Approves / Declines with reason", color: ORANGE },
    { num: 6, actor: "System", text: "On approval: selected records become accessible to new hospital", color: GREEN },
    { num: 7, actor: "System", text: "Patient receives confirmation. Audit trail recorded for both hospitals.", color: GREEN },
  ];

  return (
    <div>
      <p style={{ color: "#4A5568", fontSize: 13, marginBottom: 20 }}>
        WellNest's flagship feature. The patient initiates all transfers — the old hospital cannot block access permanently. Every step is logged in an immutable audit trail.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((s, i) => (
          <div key={s.num}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: s.color,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 14, flexShrink: 0
              }}>{s.num}</div>
              <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "10px 14px", border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <Pill text={s.actor} color={`${s.color}18`} textColor={s.color} />
                <div style={{ marginTop: 6, fontSize: 13, color: "#2D3748" }}>{s.text}</div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 2, height: 20, background: "#CBD5E0", marginLeft: 17 }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, background: "#FFF5F0", border: `1px solid ${ORANGE}44`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: ORANGE, marginBottom: 8 }}>⚡ Other Scenarios</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Unannounced visit", "New hospital gets 24-hr emergency read-only access"],
            ["Parallel care", "Patient grants both hospitals concurrent limited access"],
            ["Unlink hospital", "30-day grace period, then full revocation"],
            ["Unauthorised attempt", "Instantly blocked, flagged, patient notified"],
          ].map(([s, d]) => (
            <div key={s} style={{ background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1px solid #FED7AA" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: ORANGE }}>{s}</div>
              <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIFlowDiagram() {
  const steps = [
    { icon: "📤", text: "Patient or Doctor uploads a medical document (PDF / image)", color: BLUE },
    { icon: "🔍", text: "System runs malware scan — file only stored after passing", color: ORANGE },
    { icon: "🔐", text: "Document encrypted with AES-256 and stored in the vault", color: "#6B46C1" },
    { icon: "🤖", text: "AI Summarizer (Claude API) processes the document", color: TEAL },
    { icon: "📊", text: "AI returns three structured outputs", color: GREEN },
    { icon: "🔔", text: "Patient notified: 'Your lab report summary is ready'", color: BLUE },
  ];

  return (
    <div>
      <p style={{ color: "#4A5568", fontSize: 13, marginBottom: 20 }}>
        Every document upload triggers the AI pipeline automatically. No manual action needed — the summary appears in the vault alongside the original file.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${s.color}18`, border: `2px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                {s.icon}
              </div>
              <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "10px 14px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 13, color: "#2D3748" }}>{s.text}</div>
              </div>
            </div>
            {i < steps.length - 1 && <div style={{ width: 2, height: 16, background: "#CBD5E0", marginLeft: 21 }} />}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, background: "#F0FFF4", border: `1px solid ${GREEN}44`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: GREEN, marginBottom: 12 }}>📤 The Three AI Outputs</div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { icon: "📝", title: "Plain Summary", desc: "3–5 sentences in everyday language. No medical jargon. Anyone can understand it." },
            { icon: "⚠️", title: "Abnormal Highlights", desc: "Values outside normal ranges listed with simple clinical explanation." },
            { icon: "❓", title: "Follow-up Questions", desc: "Suggested questions to ask the doctor at the next visit, based on findings." },
          ].map(o => (
            <div key={o.title} style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "10px 12px", border: `1px solid ${GREEN}33` }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{o.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#2D3748", marginBottom: 4 }}>{o.title}</div>
              <div style={{ fontSize: 11, color: "#718096", lineHeight: 1.5 }}>{o.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmergencyDiagram() {
  const steps = [
    { icon: "🚑", text: "Patient arrives at hospital unconscious or incapacitated", color: RED },
    { icon: "🔓", text: "Treating doctor activates Emergency Access from their dashboard", color: ORANGE },
    { icon: "⏱️", text: "System grants 24-hour access — critical records ONLY", color: ORANGE, sub: "Blood group, known allergies, active conditions, current medications" },
    { icon: "📋", text: "Immutable audit log entry created — cannot be deleted by anyone", color: "#6B46C1" },
    { icon: "📲", text: "Patient's emergency contact, primary hospital, and assigned doctor are all notified", color: BLUE },
    { icon: "⌛", text: "After 24 hours: access auto-expires, OR patient extends it once conscious", color: GREEN },
  ];

  return (
    <div>
      <p style={{ color: "#4A5568", fontSize: 13, marginBottom: 20 }}>
        The emergency protocol is designed for the most critical scenario in healthcare — a patient arriving unconscious at an unfamiliar hospital. Speed and safety must coexist.
      </p>
      <div style={{ background: "#FFF5F5", border: `1px solid ${RED}33`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: RED, marginBottom: 8 }}>⚠️ What Emergency Access Shows (and ONLY this)</div>
        <div style={{ display: "flex", gap: 10 }}>
          {["🩸 Blood Group", "⚠️ Known Allergies", "🏥 Active Conditions", "💊 Current Medications"].map(i => (
            <Pill key={i} text={i} color={`${RED}12`} textColor={RED} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${s.color}18`, border: `2px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                {s.icon}
              </div>
              <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "10px 14px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 13, color: "#2D3748", fontWeight: 600 }}>{s.text}</div>
                {s.sub && <div style={{ fontSize: 11, color: "#718096", marginTop: 4 }}>{s.sub}</div>}
              </div>
            </div>
            {i < steps.length - 1 && <div style={{ width: 2, height: 16, background: "#CBD5E0", marginLeft: 21 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const diagramComponents = {
  architecture: ArchitectureDiagram,
  roles: RolesDiagram,
  transfer: TransferDiagram,
  upload: AIFlowDiagram,
  emergency: EmergencyDiagram,
};

export default function App() {
  const [active, setActive] = useState("architecture");
  const ActiveDiagram = diagramComponents[active];
  const activeMeta = diagrams.find(d => d.id === active);

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "#F0F4FB", minHeight: "100vh", padding: 24 }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: BLUE, letterSpacing: -1 }}>
          WELLNEST
        </div>
        <div style={{ color: "#718096", fontSize: 13, marginTop: 4 }}>
          Visual Architecture & Flow Diagrams · Team Briefing
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 24, flexWrap: "wrap" }}>
        {diagrams.map(d => (
          <button key={d.id} onClick={() => setActive(d.id)} style={{
            padding: "8px 18px", borderRadius: 30, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: active === d.id ? d.color : "#fff",
            color: active === d.id ? "#fff" : "#4A5568",
            boxShadow: active === d.id ? `0 4px 14px ${d.color}55` : "0 1px 4px rgba(0,0,0,0.08)",
            transition: "all 0.2s"
          }}>
            {d.emoji} {d.label}
          </button>
        ))}
      </div>

      {/* Diagram panel */}
      <div style={{ maxWidth: 860, margin: "0 auto", background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.09)", border: `2px solid ${activeMeta.color}22` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${activeMeta.color}22` }}>
          <span style={{ fontSize: 28 }}>{activeMeta.emoji}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: activeMeta.color }}>{activeMeta.label}</div>
            <div style={{ fontSize: 11, color: "#A0AEC0", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>WellNest · System Diagram</div>
          </div>
        </div>
        <ActiveDiagram />
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 24, color: "#A0AEC0", fontSize: 11 }}>
        WellNest · Hackathon 2026 · Confidential — For Team Use Only
      </div>
    </div>
  );
}
