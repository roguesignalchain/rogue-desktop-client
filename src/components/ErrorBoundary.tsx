import React from "react";
import { ShieldAlert, RotateCcw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Top-level React error boundary preventing unhandled render exceptions
 * from blanking the desktop client UI.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Unexpected rendering error",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("Uncaught UI error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0d0d12] border border-red-500/30 rounded-[4px] p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h1 className="text-base font-bold tracking-tight">
                UI Render Error
              </h1>
            </div>
            <p className="text-xs text-zinc-400 font-mono break-words bg-zinc-950 border border-zinc-800 p-3 rounded-[2px]">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-zinc-200 text-black font-semibold text-xs py-2.5 px-4 rounded-[2px] transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recover View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

