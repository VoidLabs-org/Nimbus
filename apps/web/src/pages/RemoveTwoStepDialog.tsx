import { Button } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@repo/ui/toast";
import { WindowFrame } from "../access/WindowFrame";
import { api, type TwoStepAnswer } from "../api/client";
import { tooManyAttemptsIn, WRONG_RECOVERY_CODE, WRONG_SIGN_IN_CODE } from "@repo/api";
import { queryKeys } from "../api/queries";
import { CODE_LENGTH } from "../auth/CodeEntry";
import { useCountdown } from "../auth/countdown";
import { showCodeCheckFailure } from "./codeCheckFailure";
import dialogs from "./DisconnectDialogs.module.css";
import { SecondCodeEntry } from "./SecondCodeEntry";
import classes from "./TwoStepSetupDialog.module.css";

/**
 * Remove on the Security page: a Sign-in code from the User's app, or one of their Recovery codes when they lost
 * their phone, turns Two-step verification off. The key and the Recovery codes are deleted, so setting it up again
 * starts fresh. The card behind the window goes back to Off.
 */
export function RemoveTwoStepDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Too many wrong codes for this User in the last hour: the form is off and the wait counts down. It is about the
  // User, not the kind of code, so switching between the two keeps it.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const locked = lockSeconds > 0;
  const ready = useRecoveryCode ? recoveryCode.trim() !== "" : code.length === CODE_LENGTH;

  /** Swaps the code boxes for the Recovery code box, or back; what was typed and said about it goes. */
  function switchTo(recovery: boolean) {
    setUseRecoveryCode(recovery);
    setCode("");
    setRecoveryCode("");
    setError(null);
  }

  // Each time the window opens it starts at the code boxes, with nothing typed.
  const [shownOpen, setShownOpen] = useState(opened);
  if (opened !== shownOpen) {
    setShownOpen(opened);
    if (opened) switchTo(false);
  }

  const remove = useMutation({
    mutationFn: (answer: TwoStepAnswer) => api.turnOffTwoStep(answer),
    onSuccess: () => {
      toast.success("Two-step verification is off.");
      void client.invalidateQueries({ queryKey: queryKeys.twoStep });
      onClose();
    },
    onError: (failure) =>
      showCodeCheckFailure(failure, {
        wrongCode: useRecoveryCode ? WRONG_RECOVERY_CODE : WRONG_SIGN_IN_CODE,
        setError,
        // A Recovery code stays, so a typo in it can be fixed; Remove waits until it is changed.
        clearCode: () => setCode(""),
        setLockSeconds,
        onNotOn: () => {
          toast.info("Two-step verification is already off.");
          void client.invalidateQueries({ queryKey: queryKeys.twoStep });
          onClose();
        },
      }),
  });

  return (
    <WindowFrame
      opened={opened}
      onClose={remove.isPending ? () => {} : onClose}
      title={
        <>
          <span className={classes.titleText}>Remove two-step verification?</span>
          <span className={classes.subtitle}>
            {useRecoveryCode
              ? "Enter one of the recovery codes you saved. Signing in will only ask for your password or Google or GitHub."
              : "Enter the 6-digit code from your authenticator app. Signing in will only ask for your password or Google or GitHub."}
          </span>
        </>
      }
    >
      <form
        className={classes.body}
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || remove.isPending || locked || error !== null) return;
          remove.mutate(useRecoveryCode ? { recoveryCode } : { code });
        }}
      >
        <div className={classes.codeBlock}>
          <SecondCodeEntry
            recovery={useRecoveryCode}
            code={code}
            recoveryCode={recoveryCode}
            onCode={(value) => {
              setCode(value);
              setError(null);
            }}
            onRecoveryCode={(value) => {
              setRecoveryCode(value);
              setError(null);
            }}
            onSwitch={() => switchTo(!useRecoveryCode)}
            message={locked ? tooManyAttemptsIn(lockSeconds) : error}
            wrong={error !== null}
            disabled={remove.isPending || locked}
            busy={remove.isPending}
            labelId="remove-two-step-label"
          />
        </div>
        <div className={dialogs.footer}>
          <Button variant="default" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            color="red"
            loading={remove.isPending}
            disabled={!ready || locked || error !== null}
          >
            Remove
          </Button>
        </div>
      </form>
    </WindowFrame>
  );
}
