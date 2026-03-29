/**
 * AES-256-GCM encryption for secrets at rest.
 * Set DATAHUB_MASTER_KEY environment variable or provide via plugin configuration.
 */

import * as crypto from 'crypto';
import { promisify } from 'util';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// Encrypted value format: base64(salt + iv + authTag + ciphertext)
const ENCRYPTED_PREFIX = 'enc:v1:';

const pbkdf2Async = promisify(crypto.pbkdf2);

export function isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
}

async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
    return pbkdf2Async(masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

export async function encryptSecret(plaintext: string, masterKey: string): Promise<string> {
    if (!masterKey) {
        throw new Error('Master encryption key is required for secret encryption');
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await deriveKey(masterKey, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return ENCRYPTED_PREFIX + combined.toString('base64');
}

export async function decryptSecret(encryptedValue: string, masterKey: string): Promise<string> {
    if (!masterKey) {
        throw new Error('Master encryption key is required for secret decryption');
    }

    if (!isEncrypted(encryptedValue)) {
        throw new Error('Cannot decrypt value: not in encrypted format. All secrets must be encrypted with enc:v1: prefix.');
    }

    const data = Buffer.from(encryptedValue.slice(ENCRYPTED_PREFIX.length), 'base64');
    const minLength = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
    if (data.length < minLength) {
        throw new Error('Encrypted data is malformed');
    }

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = await deriveKey(masterKey, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    } catch (error) {
        throw new Error('Failed to decrypt secret: invalid key or corrupted data');
    }
}

export function getMasterKey(envVarName = 'DATAHUB_MASTER_KEY'): string | undefined {
    return process.env[envVarName];
}

export function isEncryptionConfigured(envVarName = 'DATAHUB_MASTER_KEY'): boolean {
    const key = process.env[envVarName];
    return typeof key === 'string' && key.length >= KEY_LENGTH;
}
