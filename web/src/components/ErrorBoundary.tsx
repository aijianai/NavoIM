import { Component, type ReactNode } from "react";
import { useChatStore } from "../lib/store";
import { t as sharedT } from "@navo/shared";

import { getT } from "../lib/i18n";
const t = getT();
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught rendering error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const lang = useChatStore.getState().language;
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 text-white">
          <div className="flex w-[min(90vw,420px)] flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-red-500/15 text-3xl">
              ⚠
            </div>
            <div className="text-lg font-semibold">{t("error.callLoadFailed")}</div>
            <div className="text-sm text-white/60">
              {t("error.somethingWentWrong")}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-xl bg-white/10 px-6 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
            >
              {sharedT(lang, "common.retry")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
