import { describe, expect, it } from 'vitest';
import {
    assertRemoteFileSize,
    collectRemoteFileBody,
    createBoundedBufferSink,
} from './remote-file-content';

describe('bounded remote file content', () => {
    it('rejects invalid and oversized declared lengths', () => {
        expect(() => assertRemoteFileSize(-1, 'remote.csv', 4)).toThrow('size is invalid');
        expect(() => assertRemoteFileSize(5, 'remote.csv', 4)).toThrow(
            'exceeds the 4-byte limit',
        );
        expect(() => assertRemoteFileSize(4, 'remote.csv', 4)).not.toThrow();
    });

    it('collects streamed chunks within the byte limit', async () => {
        const body = (async function* () {
            yield Buffer.from('ab');
            yield Buffer.from('cd');
        })();

        await expect(collectRemoteFileBody(body, 'remote.csv', 4)).resolves.toEqual(
            Buffer.from('abcd'),
        );
    });

    it('stops streamed collection when the byte limit is exceeded', async () => {
        const body = (async function* () {
            yield Buffer.from('abc');
            yield Buffer.from('de');
        })();

        await expect(collectRemoteFileBody(body, 'remote.csv', 4)).rejects.toThrow(
            'exceeds the 4-byte limit',
        );
    });

    it('bounds writable download streams', async () => {
        const sink = createBoundedBufferSink('remote.csv', 4);
        sink.writable.write(Buffer.from('ab'));
        sink.writable.end(Buffer.from('cd'));
        await new Promise<void>((resolve, reject) => {
            sink.writable.on('finish', resolve);
            sink.writable.on('error', reject);
        });

        expect(sink.toBuffer()).toEqual(Buffer.from('abcd'));
    });
});
