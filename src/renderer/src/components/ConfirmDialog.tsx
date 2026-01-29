import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn } from "../lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  theme: "dark" | "light";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "削除する",
  theme,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-none border p-6 shadow-lg",
            theme === "light"
              ? "border-border-light bg-card-light text-foreground-light"
              : "border-border-dark bg-card-dark text-foreground-dark"
          )}
        >
          <AlertDialog.Title className="text-balance text-lg font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description
            className={cn(
              "text-pretty mt-2 text-sm",
              theme === "light" ? "text-muted-foreground-light" : "text-muted-foreground-dark"
            )}
          >
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className={cn(
                  "rounded-pill border px-4 py-2 text-sm font-semibold",
                  theme === "light"
                    ? "border-input-light bg-background-light text-foreground-light hover:opacity-90"
                    : "border-input-dark bg-background-dark text-foreground-dark hover:opacity-90"
                )}
                onClick={onCancel}
              >
                キャンセル
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-semibold hover:opacity-90",
                  theme === "light"
                    ? "bg-destructive-light text-destructive-foreground-light"
                    : "bg-destructive-dark text-destructive-foreground-dark"
                )}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
