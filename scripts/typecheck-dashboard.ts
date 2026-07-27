import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const allowedDiagnostics = new Set([
    'node_modules/@vendure/dashboard/src/lib/components/layout/nav-user.tsx:TS2881',
]);
const tsc = resolve(__dirname, '../node_modules/typescript/bin/tsc');
const result = spawnSync(process.execPath, [
    tsc,
    '-p',
    'tsconfig.dashboard.json',
    '--pretty',
    'false',
], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
});

if (result.error) {
    throw result.error;
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const diagnosticPattern = /^(.+?)\(\d+,\d+\): error (TS\d+):/gm;
const diagnostics = [...output.matchAll(diagnosticPattern)].map(match => ({
    key: `${match[1]}:${match[2]}`,
    path: match[1],
    code: match[2],
}));
const unexpected = diagnostics.filter(
    diagnostic => !allowedDiagnostics.has(diagnostic.key),
);

if (unexpected.length > 0 || (result.status !== 0 && diagnostics.length === 0)) {
    process.stderr.write(output);
    process.exitCode = result.status ?? 1;
} else if (result.status !== 0) {
    process.stdout.write(
        `Dashboard sources typecheck passed; ignored ${diagnostics.length} known Vendure 3.5.7 source diagnostic.\n`,
    );
}
