import { AlertTriangle, RefreshCw } from "lucide-react";

type SettingsQueryErrorStateProps = {
  resourceLabel: string;
  errorDetail?: string | null;
  onRetry: () => void | Promise<unknown>;
};

export function SettingsQueryErrorState({
  resourceLabel,
  errorDetail,
  onRetry,
}: SettingsQueryErrorStateProps) {
  return (
    <div className="space-y-3 rounded-lg border border-warn/30 bg-warn/5 p-4 text-sm">
      <div className="flex items-start gap-2 text-warn">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>Unable to load Account settings. Retry before loading {resourceLabel}.</div>
      </div>
      {errorDetail && <div className="text-xs text-mute">{errorDetail}</div>}
      <button
        type="button"
        onClick={() => void onRetry()}
        className="inline-flex items-center gap-1.5 rounded border border-bd bg-bg2/60 px-3 py-1.5 text-[11px] font-mono text-dim transition-colors hover:border-info/40 hover:text-fg"
      >
        <RefreshCw className="h-3 w-3" />
        Retry settings
      </button>
    </div>
  );
}
