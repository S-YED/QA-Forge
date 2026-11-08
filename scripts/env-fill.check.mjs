// Runnable check for fillEnv (the part of pnpm bootstrap that must never clobber a user's value):
//   node scripts/env-fill.check.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillEnv, readEnv } from './doctor.mjs';

const dir = mkdtempSync(join(tmpdir(), 'qaf-env-'));
const example = join(dir, '.env.example');
const target = join(dir, '.env');
writeFileSync(example, '# comment\nSUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_ANON_KEY=replace-with-publishable-key\nENCRYPTION_KEY=\nPORT=4000\n');

// Missing file: copied from the example, placeholders and empty values filled, the rest kept.
assert.deepEqual(fillEnv(target, example, { SUPABASE_ANON_KEY: 'anon-1', ENCRYPTION_KEY: 'a'.repeat(64), SUPABASE_URL: 'http://other' }), ['SUPABASE_ANON_KEY', 'ENCRYPTION_KEY']);
let env = readEnv(target);
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:54321'); // a real value is never replaced
assert.equal(env.SUPABASE_ANON_KEY, 'anon-1');
assert.equal(env.ENCRYPTION_KEY, 'a'.repeat(64));
assert.ok(readFileSync(target, 'utf8').includes('# comment'));

// Rerun: nothing changes, even when offered new values (a new ENCRYPTION_KEY would break stored keys).
assert.deepEqual(fillEnv(target, example, { SUPABASE_ANON_KEY: 'anon-2', ENCRYPTION_KEY: 'b'.repeat(64) }), []);
env = readEnv(target);
assert.equal(env.ENCRYPTION_KEY, 'a'.repeat(64));
assert.equal(env.SUPABASE_ANON_KEY, 'anon-1');

// A key absent from the file is appended.
assert.deepEqual(fillEnv(target, example, { NEW_KEY: 'x' }), ['NEW_KEY']);
assert.equal(readEnv(target).NEW_KEY, 'x');

console.log('env-fill: all checks passed');
