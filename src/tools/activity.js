import { z } from 'zod';
import { getDb } from '../db.js';

const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'note', 'demo', 'proposal'];

export const activityTools = [
  {
    name: 'activity_log',
    description: 'Log a sales activity (call, meeting, email, note, demo, proposal) against a lead.',
    schema: {
      lead_id: z.number().int().positive().describe('ID of the lead this activity relates to'),
      type: z.enum(ACTIVITY_TYPES).describe('Type of activity'),
      description: z.string().optional().describe('Details about what happened')
    },
    handler(args) {
      const db = getDb();
      const lead = db.prepare('SELECT name FROM leads WHERE id = ?').get(args.lead_id);
      if (!lead) return `No lead found with ID ${args.lead_id}.`;
      db.prepare(`INSERT INTO activities (lead_id, type, description) VALUES (?, ?, ?)`)
        .run(args.lead_id, args.type, args.description || null);
      return `Activity logged for ${lead.name}: [${args.type}]${args.description ? ` — ${args.description}` : ''}`;
    }
  },

  {
    name: 'followup_schedule',
    description: 'Schedule a follow-up reminder for a lead on a specific date.',
    schema: {
      lead_id: z.number().int().positive().describe('Lead ID'),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date for follow-up (YYYY-MM-DD)'),
      note: z.string().optional().describe('What to follow up about')
    },
    handler(args) {
      const db = getDb();
      const lead = db.prepare('SELECT name FROM leads WHERE id = ?').get(args.lead_id);
      if (!lead) return `No lead found with ID ${args.lead_id}.`;
      db.prepare(`INSERT INTO followups (lead_id, due_date, note) VALUES (?, ?, ?)`)
        .run(args.lead_id, args.due_date, args.note || null);
      return `Follow-up scheduled for ${lead.name} on ${args.due_date}${args.note ? `: ${args.note}` : ''}.`;
    }
  },

  {
    name: 'followup_due',
    description: 'List all follow-ups that are due today or overdue.',
    schema: {
      include_done: z.boolean().default(false).describe('Include completed follow-ups')
    },
    handler(args) {
      const db = getDb();
      const today = new Date().toISOString().split('T')[0];
      const where = args.include_done ? 'due_date <= ?' : 'due_date <= ? AND done = 0';
      const rows = db.prepare(`
        SELECT f.*, l.name as lead_name, l.company, l.stage
        FROM followups f JOIN leads l ON l.id = f.lead_id
        WHERE ${where} ORDER BY f.due_date ASC
      `).all(today);

      if (rows.length === 0) return 'No follow-ups due today or overdue.';
      const lines = rows.map(r => {
        const overdue = r.due_date < today ? ' ⚠ OVERDUE' : '';
        const done = r.done ? ' ✓' : '';
        return `  • [Lead ${r.lead_id}] ${r.lead_name}${r.company ? ` — ${r.company}` : ''} | Due: ${r.due_date}${overdue}${done}\n    ${r.note || '(no note)'}`;
      });
      return `# Follow-ups Due (${rows.length})\n\n${lines.join('\n\n')}`;
    }
  },

  {
    name: 'followup_done',
    description: 'Mark a follow-up as completed.',
    schema: {
      followup_id: z.number().int().positive().describe('Follow-up ID to mark as done')
    },
    handler(args) {
      const db = getDb();
      const result = db.prepare(`UPDATE followups SET done = 1 WHERE id = ?`).run(args.followup_id);
      if (result.changes === 0) return `No follow-up found with ID ${args.followup_id}.`;
      return `Follow-up ${args.followup_id} marked as done.`;
    }
  }
];
