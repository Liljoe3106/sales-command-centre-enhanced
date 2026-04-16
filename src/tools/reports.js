import { z } from 'zod';
import { getDb } from '../db.js';

export const reportTools = [
  {
    name: 'report_generate',
    description: 'Generate a full sales pipeline report: overview, stale deals, top opportunities, recent activity, and follow-ups due.',
    schema: {
      stale_days: z.number().int().positive().default(14).describe('Days without activity to consider a deal stale')
    },
    handler(args) {
      const db = getDb();
      const staleDays = args.stale_days ?? 14;
      const today = new Date().toISOString().split('T')[0];

      const stageSummary = db.prepare(`
        SELECT stage, COUNT(*) as count, SUM(value) as total_value
        FROM leads GROUP BY stage ORDER BY total_value DESC
      `).all();

      const totalLeads = stageSummary.reduce((s, r) => s + r.count, 0);
      const totalValue = stageSummary.reduce((s, r) => s + (r.total_value || 0), 0);
      const closedWon = stageSummary.find(r => r.stage === 'Closed Won');
      const closedLost = stageSummary.find(r => r.stage === 'Closed Lost');
      const activeLeads = totalLeads - (closedWon?.count || 0) - (closedLost?.count || 0);

      const staleLeads = db.prepare(`
        SELECT l.*,
          (SELECT MAX(created_at) FROM activities WHERE lead_id = l.id) as last_activity
        FROM leads l
        WHERE l.stage NOT IN ('Closed Won', 'Closed Lost')
        AND (
          last_activity IS NULL
          OR julianday('now') - julianday(last_activity) > ?
        )
        ORDER BY last_activity ASC NULLS FIRST
      `).all(staleDays);

      const topDeals = db.prepare(`
        SELECT * FROM leads
        WHERE stage NOT IN ('Closed Won', 'Closed Lost') AND value > 0
        ORDER BY value DESC LIMIT 5
      `).all();

      const recentActivity = db.prepare(`
        SELECT a.*, l.name as lead_name
        FROM activities a JOIN leads l ON l.id = a.lead_id
        WHERE a.created_at >= datetime('now', '-7 days')
        ORDER BY a.created_at DESC LIMIT 10
      `).all();

      const dueFups = db.prepare(`
        SELECT f.*, l.name as lead_name
        FROM followups f JOIN leads l ON l.id = f.lead_id
        WHERE f.due_date <= ? AND f.done = 0
        ORDER BY f.due_date ASC
      `).all(today);

      const lines = [];

      lines.push(`# Sales Report — ${today}`);
      lines.push(`\n## Overview`);
      lines.push(`- Total leads: ${totalLeads} (${activeLeads} active)`);
      lines.push(`- Total pipeline value: $${totalValue.toLocaleString()}`);
      if (closedWon) lines.push(`- Closed Won: ${closedWon.count} deals ($${(closedWon.total_value || 0).toLocaleString()})`);
      if (closedLost) lines.push(`- Closed Lost: ${closedLost.count} deals`);

      lines.push(`\n## Pipeline by Stage`);
      for (const s of stageSummary) {
        lines.push(`  ${s.stage}: ${s.count} lead${s.count !== 1 ? 's' : ''} — $${(s.total_value || 0).toLocaleString()}`);
      }

      if (topDeals.length > 0) {
        lines.push(`\n## Top Opportunities`);
        for (const d of topDeals) {
          lines.push(`  • [${d.id}] ${d.name}${d.company ? ` — ${d.company}` : ''} | ${d.stage} | $${d.value.toLocaleString()}`);
        }
      }

      if (staleLeads.length > 0) {
        lines.push(`\n## Stale Deals (no activity in ${staleDays}+ days) — Action Required`);
        for (const d of staleLeads) {
          const lastAct = d.last_activity ? d.last_activity.split('T')[0] : 'never';
          lines.push(`  ⚠ [${d.id}] ${d.name}${d.company ? ` — ${d.company}` : ''} | ${d.stage} | Last activity: ${lastAct}`);
        }
      } else {
        lines.push(`\n## Stale Deals\n  None — all active deals have recent activity.`);
      }

      if (dueFups.length > 0) {
        lines.push(`\n## Follow-ups Due (${dueFups.length})`);
        for (const f of dueFups) {
          const overdue = f.due_date < today ? ' ⚠ OVERDUE' : '';
          lines.push(`  • ${f.lead_name} | Due: ${f.due_date}${overdue} — ${f.note || '(no note)'}`);
        }
      }

      if (recentActivity.length > 0) {
        lines.push(`\n## Recent Activity (last 7 days)`);
        for (const a of recentActivity) {
          lines.push(`  • ${a.created_at.split('T')[0]} [${a.type}] ${a.lead_name}: ${a.description || ''}`);
        }
      } else {
        lines.push(`\n## Recent Activity\n  No activity logged in the last 7 days.`);
      }

      return lines.join('\n');
    }
  }
];
