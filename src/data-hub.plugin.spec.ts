import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { DataHubPlugin } from './data-hub.plugin';
import { AutoMapperService, FieldMapperService } from './mappers';

describe('DataHubPlugin extension exports', () => {
    it('exports mapper services for consumer Vendure plugins', () => {
        const exports = Reflect.getMetadata(
            MODULE_METADATA.EXPORTS,
            DataHubPlugin,
        ) as unknown[] | undefined;

        expect(exports).toEqual(expect.arrayContaining([
            FieldMapperService,
            AutoMapperService,
        ]));
    });
});
