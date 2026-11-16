/**
 * Pure helpers for classifying node startup errors and surfacing actionable
 * diagnostics from Geth log lines.
 */

export function isDeterministicStartupError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already in use") ||
    lower.includes("must not collide") ||
    lower.includes("must be non-zero") ||
    lower.includes("invalid ") ||
    lower.includes("shutdown is currently in progress")
  );
}

export function detectLogDiagnosticWarning(line: string): string | null {
  if (line.includes("Loaded last snap-sync pivot marker")) {
    return "[Manager Warning] Interrupted snap-sync pivot detected in chaindata. If sync stays stuck at block 0, use Settings -> Wipe Chaindata to resync cleanly in full mode.";
  }
  if (line.includes("bind: address already in use")) {
    return "[Manager Warning] Port conflict detected while binding node endpoints. Ensure no external process is holding the configured HTTP, P2P, or AuthRPC port.";
  }
  return null;
}
