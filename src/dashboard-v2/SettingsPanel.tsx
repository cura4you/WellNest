import type { ChangeEvent } from 'react';

interface ProfileFields {
  fullName: string;
  bloodGroup: string;
  gender: string;
  emergencyContact: string;
  emergencyContactPhone: string;
}

interface SettingsPanelProps {
  profile: ProfileFields;
  busy: boolean;
  feedback: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}

export function SettingsPanel({ profile, busy, feedback, onChange, onSave }: SettingsPanelProps) {
  const isSuccess = feedback.toLowerCase().includes('success');

  return (
    <div className="mv-card mv-card-pad">
      <div className="mv-form-grid">
        <div className="mv-form-field">
          <label className="mv-form-label" htmlFor="fullName">Full Name</label>
          <input id="fullName" name="fullName" className="mv-form-input" value={profile.fullName} onChange={onChange} />
        </div>
        <div className="mv-form-field">
          <label className="mv-form-label" htmlFor="bloodGroup">Blood Group</label>
          <input id="bloodGroup" name="bloodGroup" className="mv-form-input" value={profile.bloodGroup} onChange={onChange} />
        </div>
        <div className="mv-form-field">
          <label className="mv-form-label" htmlFor="gender">Gender</label>
          <input id="gender" name="gender" className="mv-form-input" value={profile.gender} onChange={onChange} />
        </div>
        <div className="mv-form-field span-2">
          <label className="mv-form-label" htmlFor="emergencyContact">Emergency Contact Name</label>
          <input id="emergencyContact" name="emergencyContact" className="mv-form-input" value={profile.emergencyContact} onChange={onChange} />
        </div>
        <div className="mv-form-field span-2">
          <label className="mv-form-label" htmlFor="emergencyContactPhone">Emergency Contact Phone</label>
          <input id="emergencyContactPhone" name="emergencyContactPhone" className="mv-form-input" value={profile.emergencyContactPhone} onChange={onChange} />
        </div>
        <div className="mv-form-field">
          <button type="button" className="mv-btn mv-btn-accent" disabled={busy} onClick={onSave} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
      {feedback && (
        <p className={`mv-status-text ${isSuccess ? 'mv-status-green' : ''}`} style={{ marginTop: 14, marginLeft: 0, color: isSuccess ? undefined : 'var(--mv-blue)' }}>
          {feedback}
        </p>
      )}
    </div>
  );
}
