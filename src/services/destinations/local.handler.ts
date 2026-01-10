/**
 * Local Destination Handler
 *
 * Handles delivery to local filesystem.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LocalDestinationConfig, DeliveryResult, DeliveryOptions } from './destination.types';

/**
 * Deliver content to local filesystem
 */
export async function deliverToLocal(
    config: LocalDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const targetPath = path.join(config.directory, filename);
    const dir = path.dirname(targetPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, content);

    return {
        success: true,
        destinationId: config.id,
        destinationType: 'local',
        filename,
        size: content.length,
        deliveredAt: new Date(),
        location: targetPath,
    };
}

/**
 * Test local destination connectivity
 */
export function testLocalDestination(config: LocalDestinationConfig): { success: boolean; message: string } {
    if (fs.existsSync(config.directory)) {
        return { success: true, message: 'Directory exists' };
    }
    // Try to create
    try {
        fs.mkdirSync(config.directory, { recursive: true });
        return { success: true, message: 'Directory created' };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create directory',
        };
    }
}
