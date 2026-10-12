import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = resolve(root, 'docs/RELEASE_REPORT.md');
const checklistPath = resolve(root, 'docs/WINDOWS_ACCEPTANCE_CHECKLIST.md');
if (!existsSync(reportPath) || !existsSync(checklistPath)) {
  console.error('تقرير الإصدار أو قائمة قبول Windows غير موجودة.');
  process.exit(1);
}

const report = readFileSync(reportPath, 'utf8');
const lines = report.split(/\r?\n/);
const ids = ['A4', 'A5', 'A6', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'E1', 'E2', 'E3', 'E4'];
const rows = lines.filter((line) => /^\| (A[4-6]|B[2-5]|C[1-4]|D[1-6]|E[1-4]) \|/.test(line));
for (const id of ids) {
  const row = rows.find((line) => line.startsWith(`| ${id} |`));
  if (!row || row.split('|').length !== 6 || !/\| (✅|🟡|❌)/.test(row)) {
    console.error(`صف التقرير مفقود أو غير صالح: ${id}`);
    process.exit(1);
  }
}
const verdicts = ['جاهز للتوزيع', 'جاهز لتجربة ميدانية محدودة بعد إتمام الـ checklist', 'غير جاهز'];
const lastLine = lines.filter(Boolean).at(-1);
if (!verdicts.includes(lastLine) || lines.filter((line) => verdicts.includes(line)).length !== 1) {
  console.error('الحكم النهائي مفقود أو مكرر أو ليس آخر سطر.');
  process.exit(1);
}
console.log(`E3 report audit passed: ${rows.length} items; one allowed final verdict; verdict is last line.`);
