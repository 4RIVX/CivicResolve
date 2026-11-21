import fs from 'node:fs';

const summaryPath = new URL('../coverage/coverage-summary.json', import.meta.url);
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

function aggregate(prefix) {
  const entries = Object.entries(summary).filter(
    ([file]) => file !== 'total' && file.includes(`/src/${prefix}/`)
  );
  const totals = entries.reduce(
    (acc, [, metrics]) => {
      for (const key of ['branches', 'branchesTrue', 'lines', 'functions', 'statements']) {
        if (key !== 'branchesTrue') acc[key].total += metrics[key]?.total ?? 0;
        if (key !== 'branchesTrue') acc[key].covered += metrics[key]?.covered ?? 0;
      }
      return acc;
    },
    {
      branches: { total: 0, covered: 0 },
      lines: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
      statements: { total: 0, covered: 0 },
    }
  );

  const result = {};
  for (const [key, value] of Object.entries(totals)) {
    result[key] = value.total === 0 ? 100 : (value.covered / value.total) * 100;
  }
  return result;
}

const failures = [];
for (const directory of ['server', 'shared']) {
  const metrics = aggregate(directory);
  console.log(
    `src/${directory}: statements=${metrics.statements.toFixed(2)}%, branches=${metrics.branches.toFixed(2)}%, functions=${metrics.functions.toFixed(2)}%, lines=${metrics.lines.toFixed(2)}%`
  );
  if (metrics.branches < 85) {
    failures.push(`src/${directory} branch coverage ${metrics.branches.toFixed(2)}% is below 85%`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
