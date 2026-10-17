import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { CrashedPage } from "./StatusPages";

type Props = {
  /** Changes whenever the User goes somewhere (React Router's location key); a crash shown is then cleared. */
  resetKey: string;
  children: ReactNode;
};

type State = {
  crashed: boolean;
  /** Bumped by Try again: the page is drawn afresh, with new state and a new load, not the state that crashed. */
  attempt: number;
  /** The resetKey the crash belongs to. */
  crashedAt: string | null;
};

/**
 * Catches a page that crashes while drawing and shows the crashed page in its place, so the navbar stays and the
 * User can leave. Going anywhere, a change of the query string included, clears it; Try again draws the page afresh.
 * The crash is logged to the console, as there is no error reporting yet.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, attempt: 0, crashedAt: null };

  static getDerivedStateFromError(): Partial<State> {
    return { crashed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (!state.crashed) return { crashedAt: props.resetKey };
    // Moved on since the crash: show the new page.
    if (state.crashedAt !== props.resetKey) return { crashed: false, crashedAt: props.resetKey };
    return null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("A page crashed while drawing", error, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return (
        <CrashedPage
          onRetry={() => this.setState(({ attempt }) => ({ crashed: false, attempt: attempt + 1 }))}
        />
      );
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
