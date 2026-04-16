import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

export const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
export const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
export const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';
export const GMAIL_FROM = process.env.GMAIL_FROM || '';

export const DB_PATH = process.env.DB_PATH ||
  join(__dirname, '..', 'data', 'sales.db');

export const gmailConfigured = () =>
  Boolean(GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_FROM);
