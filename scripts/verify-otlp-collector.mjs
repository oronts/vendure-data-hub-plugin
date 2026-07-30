import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdtempSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const vitestPath = resolve('node_modules/vitest/vitest.mjs');
if (!existsSync(vitestPath)) {
    throw new Error('Vitest is not installed; run npm ci before infrastructure tests');
}

const tlsDirectory = mkdtempSync(join(tmpdir(), 'datahub-otlp-tls-'));
const certificatePath = join(tlsDirectory, 'server.crt');
const keyPath = join(tlsDirectory, 'server.key');
const openssl = spawnSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certificatePath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
], { stdio: 'ignore' });

if (openssl.error) {
    rmSync(tlsDirectory, { recursive: true, force: true });
    throw openssl.error;
}
if (openssl.status !== 0) {
    rmSync(tlsDirectory, { recursive: true, force: true });
    throw new Error(`Failed to generate OTLP TLS certificate (exit ${openssl.status})`);
}

chmodSync(tlsDirectory, 0o750);
chmodSync(certificatePath, 0o640);
chmodSync(keyPath, 0o640);

let result;
try {
    result = spawnSync(
        process.execPath,
        [
            vitestPath,
            'run',
            'src/services/logger/otlp-collector.docker.integration.spec.ts',
        ],
        {
            env: {
                ...process.env,
                DATAHUB_OTLP_DOCKER_TEST: '1',
                DATAHUB_OTLP_TLS_DIR: tlsDirectory,
            },
            stdio: 'inherit',
        },
    );
} finally {
    rmSync(tlsDirectory, { recursive: true, force: true });
}

if (result.error) {
    throw result.error;
}
process.exitCode = result.status ?? 1;
