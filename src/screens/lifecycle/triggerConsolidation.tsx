import { useState } from 'react';
import { Button } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { ConfirmMutationDialog } from '@/screens/sessions/ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';

export function TriggerConsolidation({ isOperator }: { isOperator: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate, isLoading, error } = useMutation(async (reason: string) => {
    return await ipc.triggerConsolidation({
      command_id: crypto.randomUUID(),
      reason
    });
  });

  return (
    <>
      <Button 
        onClick={() => setConfirmOpen(true)}
        disabled={!isOperator || isLoading}
        variant="secondary"
        className="w-full"
      >
        {isLoading ? 'Triggering...' : 'Trigger Consolidation'}
      </Button>
      {error && <ErrorState reason={error} />}
      <ConfirmMutationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Consolidate lifecycle?"
        description="Reclaim dormant sessions and compact the registry. This cannot be undone."
        confirmLabel="Consolidate"
        destructive={true}
        onConfirm={async (reason) => {
          await mutate(reason);
        }}
      />
    </>
  );
}
