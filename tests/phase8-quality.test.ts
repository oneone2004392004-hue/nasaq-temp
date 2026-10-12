import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const sourceFiles = listTypeScriptFiles(join(process.cwd(), 'src'));
const explicitAny = /(?:\bas\s+any\b|:\s*any\b|<any\b|\bany\[\])/g;
const emptyPromiseCatch = /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/g;
const commentOnlyCatch = /catch\s*(?:\([^)]*\))?\s*\{((?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*?)\}/g;
const violations: string[] = [];

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  if (explicitAny.test(source)) violations.push(`${relative(process.cwd(), file)}: explicit any`);
  explicitAny.lastIndex = 0;
  if (emptyPromiseCatch.test(source)) violations.push(`${relative(process.cwd(), file)}: empty Promise catch`);
  emptyPromiseCatch.lastIndex = 0;
  commentOnlyCatch.lastIndex = 0;
  for (const match of source.matchAll(commentOnlyCatch)) {
    const body = match[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').trim();
    if (!body) violations.push(`${relative(process.cwd(), file)}: comment-only catch`);
  }
}

assert.deepEqual(violations, [], violations.join('\n'));
const { errorMessage } = await import('../src/utils/errors');
assert.equal(errorMessage(new Error('boom'), 'fallback'), 'boom');
assert.equal(errorMessage('failed', 'fallback'), 'failed');
assert.equal(errorMessage({ message: 'plugin error' }, 'fallback'), 'plugin error');
assert.equal(errorMessage({ code: 9 }, 'fallback'), 'fallback');
console.log(`C1 quality regression passed: ${sourceFiles.length} source files; zero explicit any/empty catches; unknown-error fallbacks verified.`);
