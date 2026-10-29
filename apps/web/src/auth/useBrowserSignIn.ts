import { useEffect, useRef, useState } from "react";
import { nimbusDesktop, type BrowserSignInResult, type NimbusDesktop } from "../shell/desktop";

/**
 * The Desktop app's bridge when Google and GitHub open in the system browser (ADR 0008); null in a browser, and in a
 * Desktop app from before it, where the provider's page opens in the window as a full page load.
 */
export function browserSignInBridge(): Required<
  Pick<NimbusDesktop, "signInWithProvider" | "reopenProviderSignIn" | "cancelProviderSignIn">
> | null {
  const desktop = nimbusDesktop();
  if (
    !desktop?.signInWithProvider ||
    !desktop.reopenProviderSignIn ||
    !desktop.cancelProviderSignIn
  ) {
    return null;
  }
  return desktop as Required<NimbusDesktop>;
}

/**
 * A sign-in or connect in the system browser, from the Desktop app: `run` opens it and settles with what came back,
 * while `waitingFor` names the provider for `BrowserSignInWait`. Leaving the page while it waits gives it up.
 */
export function useBrowserSignIn() {
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(
    () => () => {
      if (running.current) browserSignInBridge()?.cancelProviderSignIn();
    },
    [],
  );

  async function run(provider: string, linkTicket?: string): Promise<BrowserSignInResult> {
    const bridge = browserSignInBridge();
    if (!bridge) return { outcome: "error", error: "failed", provider };
    running.current = true;
    setWaitingFor(provider);
    try {
      return await bridge.signInWithProvider({ provider, linkTicket: linkTicket ?? null });
    } catch {
      return { outcome: "error", error: "failed", provider };
    } finally {
      running.current = false;
      setWaitingFor(null);
    }
  }

  return { waitingFor, run };
}
