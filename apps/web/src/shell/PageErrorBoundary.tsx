import { Component, type ReactNode } from "react";
import { ServerErrorPage } from "./StatusPages";

type State = { crashed: boolean };

/**
 * Catches a page that crashes while drawing and shows the server-error page in its place, so the navbar stays and
 * the User can leave. Try again draws the page afresh. Give it a `key` that changes with the address, so moving to
 * another page clears the error.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  render() {
    if (this.state.crashed)
      return <ServerErrorPage onRetry={() => this.setState({ crashed: false })} />;
    return this.props.children;
  }
}
