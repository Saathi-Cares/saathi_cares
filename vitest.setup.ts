import { config } from 'dotenv';
// Test values always win. .env is deliberately NOT loaded: integration tests must never hit a developer database.
config({ path: '.env.test', override: true });
config({ path: '.env.test.local', override: true }); // machine-specific overrides, git-ignored
