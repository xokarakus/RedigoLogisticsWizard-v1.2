/**
 * Scheduled Jobs Route Zod Schemas
 */
const { z } = require('zod');

const JobListQuery = z.object({
  job_type: z.string().max(50).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  search: z.string().max(100).optional()
}).passthrough();

const CreateJobSchema = z.object({
  name: z.string().min(1, 'name zorunlu').max(100),
  description: z.string().max(500).optional(),
  job_type: z.string().min(1, 'job_type zorunlu').max(50),
  job_class: z.enum(['A', 'B', 'C']).optional(),
  schedule_type: z.enum(['MANUAL', 'IMMEDIATE', 'ONCE', 'PERIODIC']).optional(),
  cron_expression: z.string().max(50).optional(),
  scheduled_at: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali' }).optional(),
  is_active: z.boolean().optional(),
  config: z.record(z.any()).optional(),
  tenant_id: z.string().uuid().optional()
});

const UpdateJobSchema = CreateJobSchema.partial();

module.exports = {
  JobListQuery,
  CreateJobSchema,
  UpdateJobSchema
};
