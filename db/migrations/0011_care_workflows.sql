-- Patient-entered measurements, participant-scoped scheduling and preferences.
CREATE TABLE patient_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL,
  heart_rate NUMERIC CHECK (heart_rate BETWEEN 1 AND 400),
  systolic NUMERIC CHECK (systolic BETWEEN 20 AND 350),
  diastolic NUMERIC CHECK (diastolic BETWEEN 10 AND 250),
  glucose NUMERIC CHECK (glucose BETWEEN 1 AND 1500),
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((systolic IS NULL) = (diastolic IS NULL)),
  CHECK (systolic IS NULL OR systolic > diastolic),
  CHECK (heart_rate IS NOT NULL OR systolic IS NOT NULL OR glucose IS NOT NULL)
);
CREATE INDEX patient_vitals_time_idx ON patient_vitals(patient_id, measured_at DESC);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 120),
  reason VARCHAR(500) NOT NULL,
  location VARCHAR(300) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (patient_user_id <> provider_user_id)
);
CREATE INDEX appointments_patient_time_idx ON appointments(patient_user_id, starts_at);
CREATE INDEX appointments_provider_time_idx ON appointments(provider_user_id, starts_at);
CREATE TABLE appointment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL CHECK (category IN ('access_request', 'access_granted', 'emergency_access', 'document_upload', 'appointments')),
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);
