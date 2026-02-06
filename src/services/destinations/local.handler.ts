/**
 * Local Destination Handler
 *
 * Delivery to local filesystem.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LocalDestinationConfig, DeliveryResult, DeliveryOptions, DESTINATION_TYPE } from './destination.types';
import { securePath } from '../../utils/input-validation.utils';

/**
 * Securely resolve a filename within the destination directory.
 * Prevents path traversal attacks by validating the filename
 * doesn't escape the configured directory.
 */
function getSecureTargetPath(directory: string, filename: string): string {
    const resolvedDir = path.resolve(directory);
    return securePath(resolvedDir, filename);
}

/**
 * Deliver content to local filesystem
 */
export async function deliverToLocal(
    config: LocalDestinationConfig,
    content: Buffer,
    filename: string,
    _options?: DeliveryOptions,
): Promise<DeliveryResult> {
    // Validate and resolve the target path securely
    const targetPath = getSecureTargetPath(config.directory, filename);
    const dir = path.dirname(targetPath);

    try {
        await fs.promises.access(dir);
    } catch {
        await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(targetPath, content);

    return {
        success: true,
        destinationId: config.id,
        destinationType: DESTINATION_TYPE.LOCAL,
        filename,
        size: content.length,
        deliveredAt: new Date(),
        location: targetPath,
    };
}

/**
 * Test local destination connectivity
 */
export async function testLocalDestination(config: LocalDestinationConfig): Promise<{ success: boolean; message: string }> {
    try {
        await fs.promises.access(config.directory);
        return { success: true, message: 'Directory exists' };
    } catch {
        // Directory doesn't exist, try to create it
        try {
            await fs.promises.mkdir(config.directory, { recursive: true });
            return { success: true, message: 'Directory created' };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Failed to create directory',
            };
        }
    }
}
