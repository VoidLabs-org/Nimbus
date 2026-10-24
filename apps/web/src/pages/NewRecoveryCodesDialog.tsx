import { Button } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@repo/ui/toast";
import { WindowFrame } from "../access/WindowFrame";
import { ApiError, api } from "../api/client";
import { GENERIC_ERROR, tooManyAttemptsIn, WRONG_SIGN_IN_CODE } from "../api/messages";
import { queryKeys } from "../api/queries";
import { CODE_LENGTH, CodePinInput } from "../auth/CodeEntry";
import { useCountdown } from "../auth/countdown";
import dialogs from "./DisconnectDialogs.module.css";
import { SaveRecoveryCodes } from "./SaveRecoveryCodes";
import classes from "./TwoStepSetupDialog.module.css";

/**
 * View new codes on the Security page: a Sign-in code from the User's app, then a new set of 10 Recovery codes to
 * save. The old set stops working as soon as the new one is shown, and the new codes are never shown again, so Done
 * waits for "I've saved these codes".
 */
export function NewRecoveryCodesDialog({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  // Too many wrong codes for this User in the last hour: the boxes are off and the wait counts down.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const locked = lockSeconds > 0;
  const unsaved = codes !== null && !saved;

  // Each time the window opens it starts at the code, with nothing typed and no codes from before.
  const [shownOpen, setShownOpen] = useState(opened);
  if (opened !== shownOpen) {
    setShownOpen(opened);
    if (opened) {
      setCode("");
      setError(null);
      setCodes(null);
      setSaved(false);
    }
  }

  const make = useMutation({
    mutationFn: (typed: string) => api.newRecoveryCodes(typed),
    onSuccess: ({ recoveryCodes }) => {
      setCodes(recoveryCodes);
      // The count is back to 10 of 10 now, whether or not the User saves these.
      void client.invalidateQueries({ queryKey: queryKeys.twoStep });
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 401) return;
      if (failure instanceof ApiError && failure.code === "invalid_code") {
        setError(WRONG_SIGN_IN_CODE);
        setCode("");
        return;
      }
      if (failure instanceof ApiError && failure.status === 429) {
        setCode("");
        if (failure.retryAfterSeconds) setLockSeconds(failure.retryAfterSeconds);
        else setError("Too many attempts. Try again later.");
        return;
      }
      if (failure instanceof ApiError && failure.code === "not_on") {
        toast.info("Two-step verification is off.");
        void client.invalidateQueries({ queryKey: queryKeys.twoStep });
        onClose();
        return;
      }
      setError(GENERIC_ERROR);
    },
  });

  return (
    <WindowFrame
      opened={opened}
      // Once the new codes are shown the old ones are gone, and these are never shown again: the window stays until
      // the User says they saved them, so a stray Escape or click outside can't lose them.
      onClose={make.isPending || unsaved ? () => {} : onClose}
      withCloseButton={!unsaved}
      title={
        <>
          <span className={classes.titleText}>
            {codes ? "Save your new recovery codes" : "View new recovery codes"}
          </span>
          <span className={classes.subtitle}>
            {codes
              ? "Your old codes no longer work. If you lose your phone, each of these signs you in once."
              : "Enter the 6-digit code from your authenticator app. Your old codes will stop working."}
          </span>
        </>
      }
    >
      {codes ? (
        <div className={classes.body}>
          <SaveRecoveryCodes codes={codes} saved={saved} onSavedChange={setSaved} />
          <div className={dialogs.footer}>
            <Button disabled={!saved} onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className={classes.body}
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === CODE_LENGTH && !make.isPending && !locked) make.mutate(code);
          }}
        >
          <div className={classes.codeBlock}>
            <span className={classes.label} id="new-codes-label">
              Enter the 6-digit code from the app
            </span>
            <CodePinInput
              value={code}
              onChange={(value) => {
                setCode(value);
                setError(null);
              }}
              disabled={make.isPending || locked}
              error={error !== null}
              inWindow
              aria-labelledby="new-codes-label"
            />
            {(error || locked) && (
              <div className={classes.error} role="alert">
                {locked ? tooManyAttemptsIn(lockSeconds) : error}
              </div>
            )}
          </div>
          <div className={dialogs.footer}>
            <Button variant="default" onClick={onClose} disabled={make.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={make.isPending}
              disabled={code.length !== CODE_LENGTH || locked}
            >
              Continue
            </Button>
          </div>
        </form>
      )}
    </WindowFrame>
  );
}
