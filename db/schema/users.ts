import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['patient', 'doctor', 'hospital']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  authVersion: integer('auth_version').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const patients = pgTable('patients', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  dateOfBirth: timestamp('date_of_birth', { mode: 'date' }).notNull(),
  bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
  emergencyContactName: varchar('emergency_contact_name', { length: 255 }),
  emergencyConsentEnabled: boolean('emergency_consent_enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const doctors = pgTable('doctors', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  licenseNumber: varchar('license_number', { length: 120 }).notNull().unique(),
  specialization: varchar('specialization', { length: 120 }).notNull(),
  isLicenseVerified: boolean('is_license_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hospitals = pgTable('hospitals', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  hospitalName: varchar('hospital_name', { length: 255 }).notNull(),
  proofFileId: text('proof_file_id'),
  proofFilename: varchar('proof_filename', { length: 255 }),
  proofDekWrapped: text('proof_dek_wrapped'),
  proofDekIv: text('proof_dek_iv'),
  licenseNumber: varchar('license_number', { length: 120 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }).notNull(),
  address: text('address').notNull(),
  isLicenseVerified: boolean('is_license_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
