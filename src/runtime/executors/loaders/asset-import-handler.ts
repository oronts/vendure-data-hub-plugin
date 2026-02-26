import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import {
    RequestContext,
    AssetService,
    RequestContextService,
} from '@vendure/core';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { assertUrlSafe } from '../../../utils/url-security.utils';
import { HTTP } from '../../../../shared/constants';
import { sleep } from '../../../utils/retry.utils';
import { getMimeType, extractFilenameFromUrl } from '../../../loaders/asset/helpers';

interface AssetImportConfig {
    channel?: string;
    sourceUrlField?: string;
    filenameField?: string;
    nameField?: string;
    tagsField?: string;
}

interface AssetRecord {
    [key: string]: unknown;
}

@Injectable()
export class AssetImportHandler implements LoaderHandler {
    constructor(
        private assetService: AssetService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as AssetImportConfig;

        for (const rec of input) {
            try {
                const record = rec as AssetRecord;
                const sourceUrlField = cfg.sourceUrlField ?? 'sourceUrl';
                const filenameField = cfg.filenameField ?? 'filename';
                const nameField = cfg.nameField ?? 'name';
                const sourceUrl = String(record[sourceUrlField] ?? '');
                const filename = String(record[filenameField] ?? extractFilenameFromUrl(sourceUrl));
                const name = String(record[nameField] ?? filename);

                if (!sourceUrl) { fail++; continue; }

                let opCtx = ctx;
                if (cfg.channel) {
                    const req = await this.requestContextService.create({ apiType: ctx.apiType, channelOrToken: cfg.channel });
                    if (req) opCtx = req;
                }

                const existing = await this.findByName(opCtx, name);
                if (existing) {
                    ok++;
                    continue;
                }

                const fileData = await downloadFile(sourceUrl);
                if (!fileData) {
                    if (onRecordError) await onRecordError(step.key, `Failed to download: ${sourceUrl}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                const mimeType = getMimeType(sourceUrl);
                const file = {
                    filename,
                    mimetype: mimeType,
                    createReadStream: () => bufferToStream(fileData),
                };

                const tags = cfg.tagsField && Array.isArray(record[cfg.tagsField])
                    ? record[cfg.tagsField] as string[]
                    : undefined;

                const result = await this.assetService.create(opCtx, { file, tags });

                if ('errorCode' in result) {
                    if (onRecordError) await onRecordError(step.key, `Asset creation failed: ${result.message}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'assetImport failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail };
    }

    private async findByName(ctx: RequestContext, name: string) {
        const result = await this.assetService.findAll(ctx, {
            filter: { name: { eq: name } },
            take: 1,
        });
        return result.items[0] ?? null;
    }
}

async function downloadFile(url: string): Promise<Buffer | null> {
    await assertUrlSafe(url);
    for (let attempt = 0; attempt <= HTTP.MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), HTTP.TIMEOUT_MS);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch {
            if (attempt === HTTP.MAX_RETRIES) return null;
            await sleep(HTTP.RETRY_DELAY_MS * (attempt + 1));
        }
    }
    return null;
}

function bufferToStream(buffer: Buffer): Readable {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
}
