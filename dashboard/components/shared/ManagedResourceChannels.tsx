import * as React from 'react';
import {
    Button,
    ChannelChip,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    useChannel,
} from '@vendure/dashboard';
import { useMutation } from '@tanstack/react-query';
import { Trans, useLingui } from '@lingui/react/macro';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_CHANNEL_CODE } from '../../../shared/constants';
import { getErrorMessage } from '../../../shared';

export interface ManagedResourceChannel {
    readonly id: string | number;
    readonly code: string;
    readonly token: string;
}

interface ManagedResourceChannelsProps {
    readonly channels: readonly ManagedResourceChannel[];
    readonly entityLabel: string;
    readonly canUpdate: boolean;
    readonly onAssign: (channelId: string) => Promise<unknown>;
    readonly onRemove: (channelId: string) => Promise<unknown>;
    readonly onChanged: () => void | Promise<void>;
}

export function ManagedResourceChannels({
    channels,
    entityLabel,
    canUpdate,
    onAssign,
    onRemove,
    onChanged,
}: Readonly<ManagedResourceChannelsProps>) {
    const { t } = useLingui();
    const { activeChannel, channels: allChannels } = useChannel();
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [selectedChannelId, setSelectedChannelId] = React.useState('');
    const assignedIds = React.useMemo(
        () => new Set(channels.map(channel => String(channel.id))),
        [channels],
    );
    const visibleChannels = channels.filter(
        channel => channel.code !== DEFAULT_CHANNEL_CODE,
    );
    const availableChannels = allChannels.filter(
        channel => channel.code !== DEFAULT_CHANNEL_CODE
            && !assignedIds.has(String(channel.id)),
    );
    const assign = useMutation({
        mutationFn: onAssign,
        onSuccess: async () => {
            toast.success(t`Assigned ${entityLabel} to channel`);
            setDialogOpen(false);
            setSelectedChannelId('');
            await onChanged();
        },
        onError: error => {
            toast.error(t`Could not assign ${entityLabel} to channel`, {
                description: getErrorMessage(error),
            });
        },
    });
    const remove = useMutation({
        mutationFn: onRemove,
        onSuccess: async () => {
            toast.success(t`Removed ${entityLabel} from channel`);
            await onChanged();
        },
        onError: error => {
            toast.error(t`Could not remove ${entityLabel} from channel`, {
                description: getErrorMessage(error),
            });
        },
    });

    const removeFromChannel = (channelId: string) => {
        if (String(activeChannel?.id) === channelId) {
            toast.error(t`Switch channels before removing the active assignment`);
            return;
        }
        remove.mutate(channelId);
    };

    return (
        <section className="space-y-3">
            <div>
                <h3 className="text-sm font-medium"><Trans>Channels</Trans></h3>
                <p className="text-sm text-muted-foreground">
                    <Trans>The resource is always assigned to the default channel.</Trans>
                </p>
            </div>
            <div className="flex flex-wrap gap-1">
                {visibleChannels.length > 0 ? visibleChannels.map(channel => (
                    <ChannelChip
                        key={String(channel.id)}
                        channel={{
                            id: String(channel.id),
                            code: channel.code,
                            token: channel.token,
                        }}
                        removable={
                            canUpdate
                            && !remove.isPending
                            && String(channel.id) !== String(activeChannel?.id)
                        }
                        onRemove={() => removeFromChannel(String(channel.id))}
                    />
                )) : (
                    <p className="text-sm text-muted-foreground">
                        <Trans>No additional channels assigned.</Trans>
                    </p>
                )}
            </div>
            {canUpdate && availableChannels.length > 0 && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={assign.isPending || remove.isPending}
                    onClick={() => setDialogOpen(true)}
                >
                    <Plus className="mr-1 h-4 w-4" />
                    <Trans>Assign to channel</Trans>
                </Button>
            )}
            <Dialog
                open={dialogOpen}
                onOpenChange={open => {
                    setDialogOpen(open);
                    if (!open) setSelectedChannelId('');
                }}
            >
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle><Trans>Assign to channel</Trans></DialogTitle>
                        <DialogDescription>
                            <Trans>Select an unassigned channel for this resource.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    <Select
                        value={selectedChannelId}
                        onValueChange={value => {
                            if (value != null) setSelectedChannelId(value);
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t`Select a channel`} />
                        </SelectTrigger>
                        <SelectContent>
                            {availableChannels.map(channel => (
                                <SelectItem
                                    key={String(channel.id)}
                                    value={String(channel.id)}
                                >
                                    {channel.code}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                        >
                            <Trans>Cancel</Trans>
                        </Button>
                        <Button
                            type="button"
                            disabled={!selectedChannelId || assign.isPending}
                            onClick={() => assign.mutate(selectedChannelId)}
                        >
                            <Trans>Assign</Trans>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
