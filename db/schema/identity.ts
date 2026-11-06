import { bigint, char, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [index('email_verification_user_idx').on(t.userId)]);
export const providerProofs = pgTable('provider_proofs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(), filename: text('filename').notNull(), mimeType: text('mime_type').notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }), dekWrapped: text('dek_wrapped'), dekIv: text('dek_iv'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [index('provider_proofs_user_idx').on(t.userId)]);
export const providerApplications = pgTable('provider_applications', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['draft','pending','approved','rejected'] }).default('draft').notNull(),
  proofId: uuid('proof_id').references(() => providerProofs.id), revision: integer('revision').default(0).notNull(),
  submissionNote: text('submission_note').default('').notNull(), reviewReason: text('review_reason').default('').notNull(),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }), reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const providerReviewEvents = pgTable('provider_review_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action', { enum: ['details_updated','proof_uploaded','submitted','approved','rejected'] }).notNull(),
  reason: text('reason').default('').notNull(), licenseNumber: text('license_number'), revision: integer('revision').notNull(),
  proofId: uuid('proof_id').references(() => providerProofs.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [index('provider_review_events_user_idx').on(t.userId, t.createdAt)]);
