import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { detectLogDiagnosticWarning } from "../utils/nodeDiagnostics";

const MAX_LOG_LINES = 1500;

interface LogsContextValue {
  logs: string[];
  appendLog: (line: string) => void;
  pushAppLog: (message: string, level?: "INFO" | "WARN" | "ERROR" | "DEBUG") => void;
  clearLogs: () => void;
}

const LogsContext = createContext<LogsContextValue | null>(null);

export const LogsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const emittedWarningsRef = useRef<Set<string>>(new Set());

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, line].slice(-MAX_LOG_LINES));
  }, []);

  const pushAppLog = useCallback(
    (message: string, level: "INFO" | "WARN" | "ERROR" | "DEBUG" = "INFO") => {
      const formatted = message.startsWith("[") ? message : `[App] ${message}`;
      setLogs((prev) => [...prev, formatted].slice(-MAX_LOG_LINES));
      void api.appendAppLog(level, message);
    },
    []
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const cleanups: (() => void)[] = [];

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (isCancelled) return;

        const unlistenBatch = await listen<string[]>("node-log-batch", (event) => {
          const lines = event.payload;
          if (!Array.isArray(lines) || lines.length === 0) return;
          const mapped: string[] = [];
          for (const line of lines) {
            mapped.push(`[Geth] ${line}`);
            const diag = detectLogDiagnosticWarning(line);
            if (diag && !emittedWarningsRef.current.has(diag)) {
              emittedWarningsRef.current.add(diag);
              mapped.push(diag);
              void api.appendAppLog("WARN", diag);
            }
          }
          setLogs((prev) => [...prev, ...mapped].slice(-MAX_LOG_LINES));
        });
        if (isCancelled) {
          unlistenBatch();
        } else {
          cleanups.push(unlistenBatch);
        }
      } catch {
        // Outside of Tauri context or mocking
      }
    }

    setupListeners();
    return () => {
      isCancelled = true;
      cleanups.forEach((c) => c());
    };
  }, []);

  return (
    <LogsContext.Provider value={{ logs, appendLog, pushAppLog, clearLogs }}>
      {children}
    </LogsContext.Provider>
  );
};

export function useLogs(): LogsContextValue {
  const ctx = useContext(LogsContext);
  if (!ctx) {
    throw new Error("useLogs must be used within a LogsProvider");
  }
  return ctx;
}

