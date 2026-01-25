import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn } from "../lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-lg"
          )}
        >
          <AlertDialog.Title className="text-balance text-lg font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-pretty mt-2 text-sm text-slate-300">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
                onClick={onCancel}
              >
                キャンセル
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={onConfirm}
              >
                削除する
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
