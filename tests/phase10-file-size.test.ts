import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');
const sourceFiles: string[] = [];

function collectFiles(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path);
    } else if (/\.tsx?$/.test(entry.name)) {
      sourceFiles.push(path);
    }
  }
}

collectFiles(sourceRoot);
const oversizedFiles = sourceFiles
  .map((path) => ({ path, lines: readFileSync(path, 'utf8').split(/\r?\n/).length - 1 }))
  .filter(({ lines }) => lines > 500)
  .map(({ path, lines }) => `${path.replace(`${process.cwd()}/`, '')}: ${lines}`);

assert.deepEqual(oversizedFiles, [], `Source files exceed 500 lines:\n${oversizedFiles.join('\n')}`);
console.log(`C3 source layout regression passed: ${sourceFiles.length} TypeScript files; all are at most 500 lines.`);
