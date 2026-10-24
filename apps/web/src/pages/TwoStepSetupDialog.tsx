import { Button } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "@repo/ui/toast";
import { WindowFrame } from "../access/WindowFrame";
import { ApiError, api, type TwoStepSetup } from "../api/client";
import { WRONG_SIGN_IN_CODE } from "../api/messages";
import { queryKeys } from "../api/queries";
import { CODE_LENGTH, CodePinInput } from "../auth/CodeEntry";
import { copy } from "./copy";
import { SaveRecoveryCodes } from "./SaveRecoveryCodes";
import dialogs from "./DisconnectDialogs.module.css";
import classes from "./TwoStepSetupDialog.module.css";

/**
 * Setting up two-step verification (designs 32c and 32d), in two steps: scan the key into an authenticator app and
 * prove it with a code, then save the Recovery codes and turn it on. Nothing is turned on before the last button, so
 * closing the window halfway leaves two-step verification off.
 */
export function TwoStepSetupDialog({
  opened,
  setup,
  restarting,
  onRestart,
  onClose,
}: {
  opened: boolean;
  /** The key the server made for this setup; null until it has. */
  setup: TwoStepSetup | null;
  /** A new setup is being asked for, after this one timed out. */
  restarting: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [step, setStep] = useState<"scan" | "save" | "expired">("scan");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // Each new setup (a first one, or one after Start again) begins at step 1 with nothing typed.
  const [shownSetup, setShownSetup] = useState(setup);
  if (setup !== shownSetup) {
    setShownSetup(setup);
    setStep("scan");
    setCode("");
    setError(null);
    setCodes([]);
    setSaved(false);
  }

  const verify = useMutation({
    mutationFn: (typed: string) => api.verifyTwoStepSetup(typed),
    onSuccess: ({ recoveryCodes }) => {
      setCodes(recoveryCodes);
      setStep("save");
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 401) return;
      if (failure instanceof ApiError && failure.code === "invalid_code") {
        setError(WRONG_SIGN_IN_CODE);
        setCode("");
        return;
      }
      if (failure instanceof ApiError && failure.code === "setup_expired") {
        setStep("expired");
        return;
      }
      setError("Something went wrong. Please try again.");
    },
  });
  const turnOn = useMutation({
    mutationFn: () => api.turnOnTwoStep(),
    onSuccess: async () => {
      toast.success("Two-step verification is on.");
      await client.invalidateQueries({ queryKey: queryKeys.twoStep });
      onClose();
    },
    onError: async (failure) => {
      if (failure instanceof ApiError && failure.status === 401) return;
      if (failure instanceof ApiError && failure.code === "setup_expired") {
        setStep("expired");
        return;
      }
      if (failure instanceof ApiError && failure.code === "already_on") {
        toast.info("Two-step verification is already on.");
        await client.invalidateQueries({ queryKey: queryKeys.twoStep });
        onClose();
        return;
      }
      toast.error("Couldn’t turn on two-step verification. Please try again.");
    },
  });
  const busy = verify.isPending || turnOn.isPending;
  // Closing without turning it on throws the setup away on the server too, so nothing can turn it on later with
  // codes the User may not have kept. A failure only leaves it to expire after 10 minutes.
  const cancel = () => {
    api.discardTwoStepSetup().catch(() => {});
    onClose();
  };

  return (
    <WindowFrame
      opened={opened}
      onClose={busy ? () => {} : cancel}
      title={
        step === "expired" ? (
          "Start again"
        ) : (
          // The step, the title and the line under it all sit in the header, as in the design: the frame's own
          // subtitle is drawn up under a one-line title and would run into this taller one.
          <>
            <span className={classes.step}>{step === "scan" ? "Step 1 of 2" : "Step 2 of 2"}</span>
            <span className={classes.titleText}>
              {step === "scan" ? "Scan with your app" : "Save your recovery codes"}
            </span>
            <span className={classes.subtitle}>
              {step === "scan"
                ? "Open your authenticator app and scan this code."
                : "If you lose your phone, each code signs you in once. Keep them somewhere safe."}
            </span>
          </>
        )
      }
    >
      {step === "scan" && setup && (
        <form
          className={classes.body}
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === CODE_LENGTH && !busy) verify.mutate(code);
          }}
        >
          <div className={classes.scan}>
            <QrCode value={setup.otpauthUri} />
            <div className={classes.keyBlock}>
              <span className={classes.keyLabel}>Can’t scan? Enter this key:</span>
              <div className={classes.keyPill}>
                <code className={classes.key}>{grouped(setup.key)}</code>
                <button
                  type="button"
                  className={classes.copy}
                  aria-label="Copy key"
                  onClick={() => void copy(setup.key, "Key copied.")}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
          <div className={classes.codeBlock}>
            <span className={classes.label} id="two-step-code-label">
              Enter the 6-digit code from the app
            </span>
            <CodePinInput
              value={code}
              onChange={(value) => {
                setCode(value);
                setError(null);
              }}
              error={error !== null}
              inWindow
              aria-labelledby="two-step-code-label"
            />
            {error && (
              <div className={classes.error} role="alert">
                {error}
              </div>
            )}
          </div>
          <div className={dialogs.footer}>
            <Button variant="default" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={verify.isPending} disabled={code.length !== CODE_LENGTH}>
              Continue
            </Button>
          </div>
        </form>
      )}
      {step === "save" && (
        <div className={classes.body}>
          <SaveRecoveryCodes codes={codes} saved={saved} onSavedChange={setSaved} />
          {/* Only the main button here, as in 32d: ✕ (or Escape) closes without turning anything on. */}
          <div className={dialogs.footer}>
            <Button loading={turnOn.isPending} disabled={!saved} onClick={() => turnOn.mutate()}>
              Turn on two-step verification
            </Button>
          </div>
        </div>
      )}
      {step === "expired" && (
        <div className={classes.body}>
          <p className={classes.expired}>This setup timed out. Start again to get a new code.</p>
          <div className={dialogs.footer}>
            <Button variant="default" onClick={cancel} disabled={restarting}>
              Cancel
            </Button>
            <Button loading={restarting} onClick={onRestart}>
              Start again
            </Button>
          </div>
        </div>
      )}
    </WindowFrame>
  );
}

/** The QR code an authenticator app scans, drawn here in the browser: the key never goes to another server. */
function QrCode({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then(
      (drawn) => {
        if (current) setSvg(drawn);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [value]);
  return (
    <div className={classes.qr}>
      {failed && (
        <p className={classes.qrFailed}>Couldn’t draw the QR code. Enter the key instead.</p>
      )}
      {svg && (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          alt="QR code for your authenticator app"
          width={148}
          height={148}
        />
      )}
    </div>
  );
}

/** "JBSW Y3DP EHPK 3PXP", easier to read and type than one long run of letters. */
function grouped(key: string): string {
  return key.match(/.{1,4}/g)?.join(" ") ?? key;
}
