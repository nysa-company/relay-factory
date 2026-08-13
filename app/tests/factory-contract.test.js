const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

test('Factory nonvisual paths are directory prefixes accepted by Contract 1.9', () => {
  const project = readFileSync(
    join(__dirname, '../../factory/PROJECT.env'),
    'utf8',
  );
  const declarations = project.match(/^NONVISUAL_PATHS=(.+)$/gm) || [];
  assert.deepEqual(declarations, ['NONVISUAL_PATHS=app/tools/,app/tests/']);
  for (const prefix of declarations[0].split('=')[1].split(',')) {
    assert.match(prefix, /^[A-Za-z0-9._/-]+\/$/);
  }
});
