/**
 * DataHub Parsers - Encoding Utilities
 *
 * Helper functions for handling character encodings and text conversions.
 */

/**
 * Common character encodings
 */
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

/**
 * Default encoding for file parsing
 */
export const DEFAULT_ENCODING: Encoding = 'utf-8';

/**
 * Byte Order Mark (BOM) signatures for different encodings
 */
export const BOM_SIGNATURES: Record<string, number[]> = {
    'utf-8': [0xef, 0xbb, 0xbf],
    'utf-16le': [0xff, 0xfe],
    'utf-16be': [0xfe, 0xff],
    'utf-32le': [0xff, 0xfe, 0x00, 0x00],
    'utf-32be': [0x00, 0x00, 0xfe, 0xff],
};

/**
 * Detect encoding from BOM (Byte Order Mark)
 *
 * @param buffer - Buffer to check for BOM
 * @returns Detected encoding or undefined if no BOM found
 */
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

/**
 * Get BOM length for an encoding
 *
 * @param encoding - The encoding to check
 * @returns Length of BOM in bytes
 */
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

/**
 * Remove BOM from string content
 *
 * @param content - String content potentially containing BOM
 * @returns Content with BOM removed
 */
export function removeBom(content: string): string {
    // UTF-8 BOM character
    if (content.charCodeAt(0) === 0xfeff) {
        return content.slice(1);
    }
    return content;
}

/**
 * Remove BOM from buffer
 *
 * @param buffer - Buffer potentially containing BOM
 * @param encoding - Detected or known encoding
 * @returns Buffer with BOM removed
 */
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

/**
 * Maximum sample size for binary detection to prevent performance issues
 */
const MAX_BINARY_CHECK_SIZE = 8192;

/**
 * Detect if content is likely binary
 *
 * @param buffer - Buffer to check
 * @param sampleSize - Number of bytes to check (default: 512, max: 8192)
 * @returns True if content appears to be binary
 */
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

/**
 * Convert buffer to string with encoding detection
 *
 * @param buffer - Buffer to convert
 * @param encoding - Optional encoding override
 * @returns Decoded string
 */
export function bufferToString(buffer: Buffer, encoding?: Encoding): string {
    const detectedEncoding = encoding ?? detectEncodingFromBom(buffer) ?? DEFAULT_ENCODING;
    const cleanBuffer = removeBomFromBuffer(buffer, detectedEncoding);
    return cleanBuffer.toString(detectedEncoding);
}

/**
 * Normalize line endings to Unix style
 *
 * @param content - Content with mixed line endings
 * @returns Content with normalized \n line endings
 */
export function normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Detect line ending type in content
 *
 * @param content - Content to check
 * @returns Detected line ending type
 */
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

/**
 * Remove control characters from string for safe display/storage
 *
 * @param value - String to clean
 * @returns String with control characters removed
 */
export function removeControlCharacters(value: string): string {
    let result = value.replace(/\0/g, '');
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
    return result;
}

export { removeControlCharacters as sanitizeString };

/**
 * Trim and normalize whitespace in a string
 *
 * @param value - String to clean
 * @returns Cleaned string
 */
export function cleanWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}
