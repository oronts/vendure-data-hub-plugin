export const ENCODINGS = {
    UTF8: 'utf-8',
    UTF16_LE: 'utf-16le',
    UTF16_BE: 'utf-16be',
    ASCII: 'ascii',
    LATIN1: 'latin1',
    ISO_8859_1: 'latin1',
    WINDOWS_1252: 'latin1', // Approximate
} as const;

export type Encoding = BufferEncoding;

export const DEFAULT_ENCODING: Encoding = 'utf-8';

export const BOM_SIGNATURES: Record<string, number[]> = {
    'utf-8': [0xef, 0xbb, 0xbf],
    'utf-16le': [0xff, 0xfe],
    'utf-16be': [0xfe, 0xff],
    'utf-32le': [0xff, 0xfe, 0x00, 0x00],
    'utf-32be': [0x00, 0x00, 0xfe, 0xff],
};

export function detectEncodingFromBom(buffer: Buffer): Encoding | undefined {
    if (buffer.length < 2) {
        return undefined;
    }

    // Check for UTF-32 first (longer signatures)
    if (buffer.length >= 4) {
        if (buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0x00 && buffer[3] === 0x00) {
            return 'utf16le'; // Node.js doesn't support utf-32, fallback
        }
        if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff) {
            return 'utf16le'; // Node.js doesn't support utf-32/utf-16be natively, fallback to utf16le
        }
    }

    // Check for UTF-8 BOM
    if (buffer.length >= 3) {
        if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
            return 'utf-8';
        }
    }

    // Check for UTF-16 BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf16le';
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf-16le'; // Node.js uses utf16le for big-endian as well
    }

    return undefined;
}

export function getBomLength(encoding: Encoding): number {
    switch (encoding) {
        case 'utf-8':
            return 3;
        case 'utf16le':
        case 'utf-16le':
            return 2;
        default:
            return 0;
    }
}

export function removeBom(content: string): string {
    // UTF-8 BOM character
    if (content.charCodeAt(0) === 0xfeff) {
        return content.slice(1);
    }
    return content;
}

export function removeBomFromBuffer(buffer: Buffer, encoding?: Encoding): Buffer {
    const detectedEncoding = encoding ?? detectEncodingFromBom(buffer);

    if (!detectedEncoding) {
        return buffer;
    }

    const bomLength = getBomLength(detectedEncoding);
    if (bomLength > 0 && buffer.length >= bomLength) {
        // Verify BOM exists
        const signature = BOM_SIGNATURES[detectedEncoding];
        if (signature && signature.every((byte, i) => buffer[i] === byte)) {
            return buffer.slice(bomLength);
        }
    }

    return buffer;
}

const MAX_BINARY_CHECK_SIZE = 8192;

export function isBinaryContent(buffer: Buffer, sampleSize = 512): boolean {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return false;
    }

    // Validate and clamp sampleSize
    const validatedSampleSize = Math.max(1, Math.min(sampleSize, MAX_BINARY_CHECK_SIZE));
    const checkLength = Math.min(buffer.length, validatedSampleSize);

    for (let i = 0; i < checkLength; i++) {
        const byte = buffer[i];
        // Check for null bytes or control characters (except common ones)
        if (byte === 0x00) {
            return true;
        }
        // Skip common control chars: tab, newline, carriage return
        if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
            // Allow more control characters in smaller files
            if (buffer.length < 1000) {
                continue;
            }
            return true;
        }
    }

    return false;
}

export function bufferToString(buffer: Buffer, encoding?: Encoding): string {
    const detectedEncoding = encoding ?? detectEncodingFromBom(buffer) ?? DEFAULT_ENCODING;
    const cleanBuffer = removeBomFromBuffer(buffer, detectedEncoding);
    return cleanBuffer.toString(detectedEncoding);
}

export function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function detectLineEnding(content: string): '\n' | '\r\n' | '\r' {
    const crlfCount = (content.match(/\r\n/g) || []).length;
    const crCount = (content.match(/\r(?!\n)/g) || []).length;
    const lfCount = (content.match(/(?<!\r)\n/g) || []).length;

    if (crlfCount >= lfCount && crlfCount >= crCount) {
        return '\r\n';
    }
    if (crCount >= lfCount) {
        return '\r';
    }
    return '\n';
}

export function removeControlCharacters(value: string): string {
    let result = value.replace(/\0/g, '');
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
    return result;
}

export function cleanWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}
