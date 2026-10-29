import { useSearchParams } from "react-router";
import { AuthLayout } from "../auth/AuthLayout";

/**
 * Where the browser tab ends after "Continue with Google or GitHub" in the Desktop app (ADR 0008): the app took the
 * result, so this tab only says to go back to it. `?failed=1` when the sign-in didn't work; the app says why.
 */
export default function DesktopDonePage() {
  const [searchParams] = useSearchParams();
  const failed = searchParams.has("failed");
  return (
    <AuthLayout
      gap={16}
      title={failed ? "Signing in didn’t finish" : "Continue in the Desktop app"}
      subtitle={
        failed
          ? "Go back to the Nimbus Desktop app and try again. You can close this tab."
          : "Nimbus is finishing your sign-in in the Desktop app. You can close this tab."
      }
    >
      {null}
    </AuthLayout>
  );
}
