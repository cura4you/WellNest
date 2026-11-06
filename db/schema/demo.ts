import { customType,date,index,integer,pgTable,text,timestamp,uuid } from 'drizzle-orm/pg-core';
const bytea=customType<{data:Buffer}>({dataType:()=> 'bytea'});
export const demoWorkspaces=pgTable('demo_workspaces',{
  id:uuid('id').defaultRandom().primaryKey(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),generation:integer('generation').default(1).notNull(),
  resetsUsed:integer('resets_used').default(0).notNull(),uploadsUsed:integer('uploads_used').default(0).notNull(),
  aiRequestsUsed:integer('ai_requests_used').default(0).notNull(),apiCallsUsed:integer('api_calls_used').default(0).notNull(),
},t=>[index('demo_workspaces_expiry_idx').on(t.expiresAt)]);
export const demoFiles=pgTable('demo_files',{
  objectKey:text('object_key').primaryKey(),workspaceId:uuid('workspace_id').notNull().references(()=>demoWorkspaces.id,{onDelete:'cascade'}),
  ciphertext:bytea('ciphertext').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[index('demo_files_workspace_idx').on(t.workspaceId)]);
export const demoDailyUsage=pgTable('demo_daily_usage',{
  day:date('day').primaryKey(),workspacesCreated:integer('workspaces_created').default(0).notNull(),providerCalls:integer('provider_calls').default(0).notNull(),
});
