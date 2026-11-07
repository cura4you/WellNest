import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthErrorBanner from '../../components/auth/AuthErrorBanner';
import AuthFileUpload from '../../components/auth/AuthFileUpload';
import AuthInput from '../../components/auth/AuthInput';
import AuthSelect from '../../components/auth/AuthSelect';
import AuthSubmitButton from '../../components/auth/AuthSubmitButton';
import { useAuth } from '../../hooks/useAuth';
import { roleByKey } from '../../utils/authRoles';
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validatePhone,
  validateRequired,
} from '../../utils/authValidation';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const SPECIALIZATIONS = ['General Medicine', 'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics'];

function getInitialForm(roleKey) {
  if (roleKey === 'patient') {
    return {
      fullName: '',
      email: '',
      dateOfBirth: '',
      bloodGroup: '',
      gender: '',
      password: '',
      confirmPassword: '',
    };
  }

  if (roleKey === 'doctor') {
    return {
      fullName: '',
      email: '',
      licenseNumber: '',
      specialization: '',
      password: '',
      confirmPassword: '',
    };
  }

  return {
    hospitalName: '',
    officialEmail: '',
    licenseNumber: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
  };
}

export default function RoleRegisterPage({ roleKey }) {
  const role = useMemo(() => roleByKey(roleKey), [roleKey]);
  const navigate = useNavigate();
  const { register, loading, error, clearError } = useAuth();
  const [form, setForm] = useState(getInitialForm(role.key));
  const [proofFile, setProofFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    clearError();
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setProofFile(file);
    setFieldErrors((prev) => ({ ...prev, proof: '' }));
    clearError();
  };

  const validate = () => {
    const nextErrors = {};

    if (role.key === 'patient') {
      nextErrors.fullName = validateRequired(form.fullName, 'Full name');
      nextErrors.email = validateEmail(form.email);
      nextErrors.dateOfBirth = validateRequired(form.dateOfBirth, 'Date of birth');
      nextErrors.bloodGroup = validateRequired(form.bloodGroup, 'Blood group');
      nextErrors.gender = validateRequired(form.gender, 'Gender');
    }

    if (role.key === 'doctor') {
      nextErrors.fullName = validateRequired(form.fullName, 'Full name');
      nextErrors.email = validateEmail(form.email);
      nextErrors.licenseNumber = validateRequired(form.licenseNumber, 'Medical license number');
      nextErrors.specialization = validateRequired(form.specialization, 'Specialization');
    }

    if (role.key === 'hospital') {
      nextErrors.hospitalName = validateRequired(form.hospitalName, 'Hospital name');
      nextErrors.officialEmail = validateEmail(form.officialEmail, 'Official email');
      nextErrors.licenseNumber = validateRequired(form.licenseNumber, 'License / registration number');
      nextErrors.phone = validatePhone(form.phone);
      nextErrors.address = validateRequired(form.address, 'Address');
      nextErrors.proof = proofFile ? '' : 'Proof document is required.';
    }

    nextErrors.password = validatePassword(form.password);
    nextErrors.confirmPassword = validateConfirmPassword(form.password, form.confirmPassword);

    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((message) => !message);
  };

  const buildPayload = () => {
    if (role.key !== 'hospital') {
      const payload = { ...form };
      delete payload.confirmPassword;
      return payload;
    }

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key !== 'confirmPassword') {
        payload.append(key, value);
      }
    });
    if (proofFile) {
      payload.append('proofDocument', proofFile);
    }
    return payload;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    try {
      await register({ role: role.key, data: buildPayload() });
      navigate(role.dashboardPath);
    } catch {
      // Error is already surfaced by AuthContext.
    }
  };

  return (
    <>
      <Navbar />
      <AuthLayout
        title={`Create ${role.label} account`}
        subtitle="Set up your credentials and complete role verification to access the WellNest ecosystem."
        roleLabel={`${role.label} Registration`}
        mode="register"
      >
        <form onSubmit={onSubmit} noValidate>
          <AuthErrorBanner message={error} />

          {role.key === 'patient' ? (
            <>
              <AuthInput id="fullName" label="Full Name" value={form.fullName} onChange={onChange} error={fieldErrors.fullName} />
              <AuthInput id="email" label="Email" type="email" value={form.email} onChange={onChange} error={fieldErrors.email} />
              <AuthInput id="dateOfBirth" label="Date of Birth" type="date" value={form.dateOfBirth} onChange={onChange} error={fieldErrors.dateOfBirth} />
              <AuthSelect
                id="bloodGroup"
                label="Blood Group"
                value={form.bloodGroup}
                onChange={onChange}
                options={BLOOD_GROUPS}
                error={fieldErrors.bloodGroup}
              />
              <AuthSelect
                id="gender"
                label="Gender"
                value={form.gender}
                onChange={onChange}
                options={GENDERS}
                error={fieldErrors.gender}
              />
            </>
          ) : null}

          {role.key === 'doctor' ? (
            <>
              <AuthInput id="fullName" label="Full Name" value={form.fullName} onChange={onChange} error={fieldErrors.fullName} />
              <AuthInput id="email" label="Email" type="email" value={form.email} onChange={onChange} error={fieldErrors.email} />
              <AuthInput
                id="licenseNumber"
                label="Medical License Number"
                value={form.licenseNumber}
                onChange={onChange}
                error={fieldErrors.licenseNumber}
              />
              <AuthSelect
                id="specialization"
                label="Specialization"
                value={form.specialization}
                onChange={onChange}
                options={SPECIALIZATIONS}
                error={fieldErrors.specialization}
              />
            </>
          ) : null}

          {role.key === 'hospital' ? (
            <>
              <AuthInput
                id="hospitalName"
                label="Hospital Name"
                value={form.hospitalName}
                onChange={onChange}
                error={fieldErrors.hospitalName}
              />
              <AuthInput
                id="officialEmail"
                label="Official Email"
                type="email"
                value={form.officialEmail}
                onChange={onChange}
                error={fieldErrors.officialEmail}
              />
              <AuthInput
                id="licenseNumber"
                label="License / Registration Number"
                value={form.licenseNumber}
                onChange={onChange}
                error={fieldErrors.licenseNumber}
              />
              <AuthInput id="phone" label="Phone Number" value={form.phone} onChange={onChange} error={fieldErrors.phone} />
              <div className="auth-field">
                <label htmlFor="address">Address</label>
                <textarea
                  id="address"
                  name="address"
                  value={form.address}
                  onChange={onChange}
                  className={fieldErrors.address ? 'has-error' : ''}
                  aria-invalid={Boolean(fieldErrors.address)}
                />
                {fieldErrors.address ? <p className="auth-field-error">{fieldErrors.address}</p> : null}
              </div>
              <AuthFileUpload
                id="proof"
                label="Proof Document"
                onChange={onFileChange}
                helperText="Upload hospital proof document (PDF, JPG, PNG)."
                error={fieldErrors.proof}
              />
            </>
          ) : null}

          <AuthInput
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={onChange}
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <AuthInput
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={onChange}
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />

          <AuthSubmitButton loading={loading} label={`Register as ${role.label}`} />
          <p className="auth-switch-copy">
            Need another role? <Link to="/register">Switch role</Link>
          </p>
        </form>
      </AuthLayout>
    </>
  );
}
