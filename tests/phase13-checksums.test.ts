import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const manifest = 'Nasaq-POS-v1.0.2/checksums/DIST_CHECKSUMS.sha256';
const contents = readFileSync(join(process.cwd(), manifest), 'utf8');
const listedFiles = contents.split(/\r?\n/).filter(Boolean);
assert.ok(listedFiles.length > 0, 'checksum manifest must not be empty');
const output = execFileSync('sha256sum', ['-c', manifest], { encoding: 'utf8' });
assert.equal(output.split(/\r?\n/).filter((line) => line.endsWith(': OK')).length, listedFiles.length);
console.log(`D3 checksum regression passed: ${listedFiles.length} files verified.`);
