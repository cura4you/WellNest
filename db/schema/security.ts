import { char, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
export const revokedTokens = pgTable('revoked_tokens', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [index('revoked_tokens_expiry_idx').on(table.expiresAt)]);
export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('password_reset_user_idx').on(table.userId)]);
export const authRateLimits = pgTable('auth_rate_limits', {
  keyHash: char('key_hash', { length: 64 }).primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull(),
});
