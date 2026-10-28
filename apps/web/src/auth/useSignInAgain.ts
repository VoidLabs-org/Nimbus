import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { loginPath } from "./returnPath";
import { useSession } from "./useSession";

/**
 * "Sign in again" for a step that needs a recent sign-in (connecting a provider, setting up two-step verification):
 * signs out, then the sign-in page brings the User back to `returnTo`. Signing out already sends the app there by
 * itself; the navigate goes to the same address, replacing the entry, so Back never shows the sign-in page twice.
 */
export function useSignInAgain(returnTo: string) {
  const { logout } = useSession();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      await logout(returnTo);
      void navigate(loginPath(returnTo), { replace: true });
    },
  });
}
