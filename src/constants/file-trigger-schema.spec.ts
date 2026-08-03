import { describe, expect, it } from 'vitest';
import { TriggerType } from './enums';
import { FILE_WATCH } from './defaults/storage-defaults';
import { TRIGGER_TYPE_SCHEMAS } from './adapter-schema-options';

describe('file trigger dynamic schema', () => {
    it('exposes every supported nested file-watch control', () => {
        const schema = TRIGGER_TYPE_SCHEMAS.find(
            option => option.value === TriggerType.FILE,
        );
        const fields = Object.fromEntries(
            (schema?.fields ?? []).map(field => [field.key, field]),
        );

        expect(Object.keys(fields)).toEqual([
            'connectionCode',
            'path',
            'pattern',
            'recursive',
            'minFileAge',
            'pollIntervalMs',
        ]);
        expect(fields.minFileAge).toMatchObject({
            defaultValue: FILE_WATCH.DEFAULT_MIN_FILE_AGE_SEC,
            min: FILE_WATCH.MIN_FILE_AGE_SEC,
            max: FILE_WATCH.MAX_FILE_AGE_SEC,
        });
        expect(fields.pollIntervalMs).toMatchObject({
            defaultValue: FILE_WATCH.DEFAULT_POLL_INTERVAL_MS,
            min: FILE_WATCH.MIN_POLL_INTERVAL_MS,
            max: FILE_WATCH.MAX_POLL_INTERVAL_MS,
        });
        expect(schema?.configKeyMap).toEqual({
            connectionCode: 'fileWatch.connectionCode',
            path: 'fileWatch.path',
            pattern: 'fileWatch.pattern',
            recursive: 'fileWatch.recursive',
            minFileAge: 'fileWatch.minFileAge',
            pollIntervalMs: 'fileWatch.pollIntervalMs',
        });
    });
});
