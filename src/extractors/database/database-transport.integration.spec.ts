import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExtractorContext } from '../../types';
import { DatabaseType } from '../../constants';
import { configureGlobalSsrfProtection } from '../../utils/url-security.utils';
import { createDatabaseClient } from './connection-pool';

const postgresUrl = process.env.DATAHUB_TEST_POSTGRES_URL;
const mysqlUrl = process.env.DATAHUB_TEST_MYSQL_URL;
const describeIntegration = postgresUrl && mysqlUrl ? describe : describe.skip;

const context = {
    secrets: { get: async () => undefined },
} as unknown as ExtractorContext;

describeIntegration('database pinned transport integration', () => {
    beforeAll(() => {
        configureGlobalSsrfProtection({ allowedHostnames: ['127.0.0.1'] });
    });

    afterAll(() => {
        configureGlobalSsrfProtection({});
    });

    it.each([
        [DatabaseType.POSTGRESQL, postgresUrl],
        [DatabaseType.MYSQL, mysqlUrl],
    ] as const)('executes a real query through the %s pinned pool', async (databaseType, connectionString) => {
        const client = await createDatabaseClient(context, {
            databaseType,
            connectionString,
            query: 'SELECT 1 AS value',
        });

        try {
            const result = await client.query('SELECT 1 AS value');
            expect(result.rowCount).toBe(1);
            expect(Number(result.rows[0]?.value)).toBe(1);
        } finally {
            await client.close();
        }
    });
});
