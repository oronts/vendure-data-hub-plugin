/**
 * Local Destination Handler
 *
 * Delivery to local filesystem.
 */

import { FILE_STORAGE } from '../../constants';
import { resolveSafeOutputPath, writeFileSafely } from '../../utils/safe-output-path.utils';
import { LocalDestinationConfig, DeliveryResult, DeliveryOptions, DESTINATION_TYPE } from './destination.types';
import { getErrorMessage } from '../../utils/error.utils';


/**
 * Deliver content to local filesystem
 */
export async function deliverToLocal(
    config: LocalDestinationConfig,
    content: Buffer,
    filename: string,
    _options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const targetPath = await resolveSafeOutputPath(FILE_STORAGE.EXPORT_ROOT, config.directory, filename);
    await writeFileSafely(targetPath, content);

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
        await resolveSafeOutputPath(FILE_STORAGE.EXPORT_ROOT, config.directory, '.data-hub-write-test');
        return { success: true, message: 'Directory is available within the export root' };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
        };
    }
}
