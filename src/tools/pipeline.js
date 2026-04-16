import { z } from 'zod';
import { getDb } from '../db.js';

const STAGES = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];

export const pipelineTools = [
  {
    name: 'pipeline_view',
    description: 'View all leads grouped by sales stage. Returns counts, values, and lead details.',
    schema: {
      stage: z.enum(STAGES).optional().describe('Filter to a specific stage')
    },
    handler(args) {
      const db = getDb();
      const where = args.stage ? 'WHERE stage = ?' : '';
      const params = args.stage ? [args.stage] : [];
      const leads = db.prepare(`SELECT * FROM leads ${where} ORDER BY stage, created_at DESC`).all(...params);

      const grouped = {};
      for (const stage of STAGES) grouped[stage] = [];
      for (const lead of leads) {
        if (!grouped[lead.stage]) grouped[lead.stage] = [];
        grouped[lead.stage].push(lead);
      }

      const lines = [];
      let totalValue = 0;
      for (const [stage, items] of Object.entries(grouped)) {
        if (items.length === 0) continue;
        const stageValue = items.reduce((s, l) => s + (l.value || 0), 0);
        totalValue += stageValue;
        lines.push(`\n## ${stage} (${items.length} lead${items.length !== 1 ? 's' : ''}, $${stageValue.toLocaleString()})`);
        for (const l of items) {
          lines.push(`  • [${l.id}] ${l.name}${l.company ? ` — ${l.company}` : ''}${l.email ? ` <${l.email}>` : ''}${l.value ? ` | $${l.value.toLocaleString()}` : ''}${l.notes ? `\n    Notes: ${l.notes}` : ''}`);
        }
      }

      if (lines.length === 0) return 'No leads in the pipeline yet. Use lead_add to add your first lead.';
      return `# Sales Pipeline — Total Value: $${totalValue.toLocaleString()}\n${lines.join('\n')}`;
    }
  },

  {
    name: 'lead_add',
    description: 'Add a new lead to the sales pipeline.',
    schema: {
      name: z.string().min(1).describe('Full name of the lead'),
      company: z.string().optional().describe('Company name'),
      email: z.string().email().optional().describe('Email address'),
      phone: z.string().optional().describe('Phone number'),
      stage: z.enum(STAGES).default('New').describe('Pipeline stage'),
      value: z.number().nonnegative().default(0).describe('Estimated deal value in dollars'),
      notes: z.string().optional().describe('Any notes about this lead')
    },
    handler(args) {
      const db = getDb();
      const result = db.prepare(
        `INSERT INTO leads (name, company, email, phone, stage, value, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        args.name,
        args.company || null,
        args.email || null,
        args.phone || null,
        args.stage ?? 'New',
        args.value ?? 0,
        args.notes || null
      );
      return `Lead added.\nID: ${result.lastInsertRowid} | ${args.name}${args.company ? ` — ${args.company}` : ''} | Stage: ${args.stage ?? 'New'}`;
    }
  },

  {
    name: 'lead_update',
    description: "Update a lead's stage, notes, value, or any other field by lead ID.",
    schema: {
      id: z.number().int().positive().describe('Lead ID to update'),
      name: z.string().optional(),
      company: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      stage: z.enum(STAGES).optional(),
      value: z.number().nonnegative().optional(),
      notes: z.string().optional().describe('Replaces existing notes')
    },
    handler(args) {
      const { id, ...fields } = args;
      const db = getDb();
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
      if (!lead) return `No lead found with ID ${id}.`;

      const allowed = ['name', 'company', 'email', 'phone', 'stage', 'value', 'notes'];
      const updates = Object.entries(fields).filter(([k, v]) => allowed.includes(k) && v !== undefined);
      if (updates.length === 0) return 'No valid fields provided to update.';

      const set = updates.map(([k]) => `${k} = ?`).join(', ');
      const values = updates.map(([, v]) => v);
      db.prepare(`UPDATE leads SET ${set}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);

      return `Lead [${id}] updated: ${updates.map(([k, v]) => `${k} → ${v}`).join(', ')}`;
    }
  }
];
