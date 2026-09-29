import 'dotenv/config';
// Integration tests read DATABASE_URL from .env.test when present.
import { config } from 'dotenv';
config({ path: '.env.test', override: false });
