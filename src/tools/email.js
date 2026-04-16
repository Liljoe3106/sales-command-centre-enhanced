import { z } from 'zod';
import { createTransport } from 'nodemailer';
import { google } from 'googleapis';
import { getDb } from '../db.js';
import { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM, gmailConfigured } from '../config.js';

async function getTransport() {
  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  const { token: accessToken } = await oauth2Client.getAccessToken();
  return createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: GMAIL_FROM,
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      refreshToken: GMAIL_REFRESH_TOKEN,
      accessToken
    }
  });
}

export const emailTools = [
  {
    name: 'email_send',
    description: 'Send an email via Gmail on behalf of the sales rep. Optionally links to a lead for tracking.',
    schema: {
      to: z.string().email().describe('Recipient email address'),
      subject: z.string().min(1).describe('Email subject line'),
      body: z.string().min(1).describe('Plain text email body'),
      lead_id: z.number().int().positive().optional().describe('Lead ID to associate this email with')
    },
    async handler(args) {
      if (!gmailConfigured()) {
        return [
          'Gmail is not configured. Add these to your .env file:',
          '  GMAIL_CLIENT_ID=your_client_id',
          '  GMAIL_CLIENT_SECRET=your_client_secret',
          '  GMAIL_REFRESH_TOKEN=your_refresh_token',
          '  GMAIL_FROM=you@gmail.com',
          '',
          'See .env.example for full setup instructions.'
        ].join('\n');
      }

      const transport = await getTransport();
      await transport.sendMail({ from: GMAIL_FROM, to: args.to, subject: args.subject, text: args.body });

      const db = getDb();
      db.prepare(`INSERT INTO emails_sent (lead_id, to_address, subject, body) VALUES (?, ?, ?, ?)`)
        .run(args.lead_id || null, args.to, args.subject, args.body);

      if (args.lead_id) {
        db.prepare(`INSERT INTO activities (lead_id, type, description) VALUES (?, 'email', ?)`)
          .run(args.lead_id, `Sent email: "${args.subject}"`);
      }

      return `Email sent to ${args.to}\nSubject: ${args.subject}`;
    }
  }
];
