import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('supabase/sql/migrations');
const orderPath = path.join(directory, 'order.txt');
const order = fs.readFileSync(orderPath, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));
const files = fs.readdirSync(directory)
  .filter(file => /^\d.*\.sql$/.test(file))
  .sort();

assert.deepEqual(
  new Set(order).size,
  order.length,
  'order.txt contains a duplicate migration filename',
);
assert.deepEqual(
  [...files].sort(),
  [...order].sort(),
  'order.txt and the SQL migration files do not match',
);

let previous = 17;
for (const file of order) {
  const number = Number(file.match(/^(\d+)/)?.[1]);
  assert.ok(Number.isInteger(number), `Invalid migration filename: ${file}`);
  assert.ok(number >= previous, `Migration order goes backwards at ${file}`);
  assert.ok(number <= previous + 1, `Migration number jumps before ${file}`);
  const sql = fs.readFileSync(path.join(directory, file), 'utf8');
  assert.match(sql, /\b(BEGIN|CREATE|ALTER|COMMENT)\b/i, `${file} does not look like SQL`);
  previous = number;
}

assert.equal(previous, 33, 'Update the expected latest migration and release documentation');
console.log(`Migration order valid: ${order.length} files, 018-033.`);
