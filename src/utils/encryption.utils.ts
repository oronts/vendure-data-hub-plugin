/**
 * Encryption Utilities for Secret Management
 *
 * AES-256-GCM encryption for secrets at rest.
 * The encryption key should be provided via environment variable
 * or plugin configuration.
 *
 * @module utils/encryption
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Encrypted value format: base64(salt + iv + authTag + ciphertext)
 */
const ENCRYPTED_PREFIX = 'enc:v1:';

/**
 * Check if a value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Derive an encryption key from a password/master key using PBKDF2
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a secret value using AES-256-GCM
 *
 * @param plaintext - The secret value to encrypt
 * @param masterKey - The master encryption key (from env or config)
 * @returns Encrypted value with prefix
 *
 * @example
 * ```typescript
 * const encrypted = encryptSecret('my-api-key', process.env.DATAHUB_MASTER_KEY);
 * // Returns: "enc:v1:base64encodeddata..."
 * ```
 */
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

/**
 * Decrypt a secret value encrypted with encryptSecret
 *
 * @param encryptedValue - The encrypted value (with enc:v1: prefix)
 * @param masterKey - The master encryption key
 * @returns Decrypted plaintext
 *
 * @example
 * ```typescript
 * const plaintext = decryptSecret(encryptedValue, process.env.DATAHUB_MASTER_KEY);
 * ```
 */
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

/**
 * Generate a secure random encryption key
 *
 * Use this to generate a master key for your deployment.
 * Store the key securely (environment variable, secrets manager, etc.)
 *
 * @returns A 64-character hex string suitable for use as DATAHUB_MASTER_KEY
 *
 * @example
 * ```bash
 * # Generate and set as environment variable
 * export DATAHUB_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
 * ```
 */
export function generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Rotate encryption key by re-encrypting a value
 *
 * @param encryptedValue - Value encrypted with old key
 * @param oldKey - The previous master key
 * @param newKey - The new master key
 * @returns Value encrypted with new key
 */
export function rotateKey(encryptedValue: string, oldKey: string, newKey: string): string {
    const plaintext = decryptSecret(encryptedValue, oldKey);
    return encryptSecret(plaintext, newKey);
}

/**
 * Get the master encryption key from environment or throw
 *
 * @param envVarName - Environment variable name (default: DATAHUB_MASTER_KEY)
 * @returns Master key
 * @throws Error if key is not set
 */
export function getMasterKey(envVarName = 'DATAHUB_MASTER_KEY'): string | undefined {
    return process.env[envVarName];
}

/**
 * Check if encryption is configured (master key is available)
 */
export function isEncryptionConfigured(envVarName = 'DATAHUB_MASTER_KEY'): boolean {
    const key = process.env[envVarName];
    return typeof key === 'string' && key.length >= 32;
}
