/**
 * AES-256-GCM encryption for secrets at rest.
 * Set DATAHUB_MASTER_KEY environment variable or provide via plugin configuration.
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// Encrypted value format: base64(salt + iv + authTag + ciphertext)
const ENCRYPTED_PREFIX = 'enc:v1:';

export function isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

export function encryptSecret(plaintext: string, masterKey: string): string {
    if (!masterKey) {
        throw new Error('Master encryption key is required for secret encryption');
    }

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from master key
    const key = deriveKey(masterKey, salt);

    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    // Get auth tag for integrity verification
    const authTag = cipher.getAuthTag();

    // Combine: salt + iv + authTag + ciphertext
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return ENCRYPTED_PREFIX + combined.toString('base64');
}

export function decryptSecret(encryptedValue: string, masterKey: string): string {
    if (!masterKey) {
        throw new Error('Master encryption key is required for secret decryption');
    }

    if (!isEncrypted(encryptedValue)) {
        // Return as-is if not encrypted (for backward compatibility)
        return encryptedValue;
    }

    // Remove prefix and decode
    const data = Buffer.from(encryptedValue.slice(ENCRYPTED_PREFIX.length), 'base64');

    // Extract components
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from master key
    const key = deriveKey(masterKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
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
    return typeof key === 'string' && key.length >= 32;
}
