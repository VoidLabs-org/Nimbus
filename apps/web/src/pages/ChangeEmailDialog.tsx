import { IconAlertCircle, IconCheck, IconInfoCircle } from "@tabler/icons-react";
import { Anchor, Button, TextInput } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@repo/ui/toast";
import { WindowFrame } from "../access/WindowFrame";
import { api, type ConfirmAnswer } from "../api/client";
import {
  ApiError,
  clock,
  EMAIL_TAKEN,
  emailChangeCodeMessage,
  GENERIC_ERROR,
  RESEND_WAIT_SECONDS,
  SAME_EMAIL,
  sameAddress,
} from "@repo/api";
import { CODE_LENGTH, CodePinInput } from "../auth/CodeEntry";
import { useCountdown } from "../auth/countdown";
import { useSession } from "../auth/useSession";
import { confirmHeading, type ConfirmPhase } from "../settings/profileView";
import { ConfirmItsYouStep } from "./ConfirmItsYouStep";
import dialogs from "./DisconnectDialogs.module.css";
import setup from "./TwoStepSetupDialog.module.css";
import classes from "./ChangeEmailDialog.module.css";

/**
 * Step 1 ("confirm") renews an old sign-in, step 2 asks for the new address, step 3 for the code sent there;
 * "expired" is 39j, when that code is gone.
 */
type Step = "confirm" | "email" | "code" | "expired";

/**
 * Change email on Profile (designs 39d–39k): a Verification code goes to the new address, and the email changes only
 * once it is entered, so a typo can't lock the User out. Closing the window leaves the email as it was; the pending
 * change just expires. A sign-in too old for this asks for the password first ("Confirm it's you", 39b/39c), and a
 * User without one to sign in again (`onReauthRequired`) instead.
 */
export function ChangeEmailDialog({
  opened,
  currentEmail,
  onClose,
  onReauthRequired,
}: {
  opened: boolean;
  currentEmail: string;
  onClose: () => void;
  onReauthRequired: () => void;
}) {
  const { user, changeEmail } = useSession();
  const [step, setStep] = useState<Step>("email");
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>("password");
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  // The address the code went to, as sent (trimmed), so the copy names exactly where to look.
  const [sentTo, setSentTo] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  // An address was sent codes too fast: Send code is off for it while this counts down. The server counts per
  // address, so typing another one lifts it.
  const [waitSeconds, setWaitSeconds] = useCountdown();
  const [waitFor, setWaitFor] = useState("");
  const waiting = waitSeconds > 0 && sameAddress(newEmail, waitFor);
  const [resendSeconds, setResendSeconds] = useCountdown();

  // Each time the window opens it starts at the new address, with nothing typed.
  const [shownOpen, setShownOpen] = useState(opened);
  if (opened !== shownOpen) {
    setShownOpen(opened);
    if (opened) {
      setStep("email");
      setNewEmail("");
      setEmailError(null);
      setCode("");
      setCodeError(null);
      setWaitSeconds(0);
      setResendSeconds(0);
    }
  }

  const send = useMutation({
    mutationFn: (email: string) => api.requestEmailChange(email),
    onSuccess: (_, email) => {
      setSentTo(email);
      setCode("");
      setCodeError(null);
      setResendSeconds(RESEND_WAIT_SECONDS);
      setStep("code");
    },
    onError: (failure, email) => {
      // A send from the address step, or the one that follows Confirm it's you, is about the address typed.
      const fromAddress = step === "email" || step === "confirm";
      if (failure instanceof ApiError && failure.code === "reauth_required") {
        if (user?.hasPassword) {
          setConfirmPhase("password");
          setConfirmRecovery(false);
          setStep("confirm");
        } else {
          onReauthRequired();
        }
      } else if (failure instanceof ApiError && failure.status === 429) {
        const seconds = failure.retryAfterSeconds ?? RESEND_WAIT_SECONDS;
        if (fromAddress) {
          setWaitFor(email);
          setWaitSeconds(seconds);
          setStep("email");
        } else {
          setResendSeconds(seconds);
        }
      } else if (failure instanceof ApiError && failure.code === "same_email") {
        // From a resend too: the address is what is wrong, so go back to it.
        setEmailError(SAME_EMAIL);
        setStep("email");
      } else if (failure instanceof ApiError && failure.code === "email_taken") {
        setEmailError(EMAIL_TAKEN);
        setStep("email");
      } else if (!fromAddress) {
        // A toast, not the code's error: the code typed may still be right.
        toast.error("Couldn’t send a new code. Please try again.");
      } else if (failure instanceof ApiError && failure.fieldErrors.email) {
        setEmailError(failure.fieldErrors.email);
        setStep("email");
      } else {
        setEmailError(GENERIC_ERROR);
        setStep("email");
      }
    },
  });

  const confirm = useMutation({
    mutationFn: (entered: string) => changeEmail(entered),
    onSuccess: () => {
      toast.success(`Email changed to ${sentTo}`);
      onClose();
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.code === "invalid_code") {
        setCodeError(emailChangeCodeMessage(failure.triesLeft));
      } else if (failure instanceof ApiError && failure.code === "code_expired") {
        setCode("");
        setStep("expired");
      } else if (failure instanceof ApiError && failure.code === "email_taken") {
        setEmailError(EMAIL_TAKEN);
        setStep("email");
      } else {
        setCodeError(GENERIC_ERROR);
      }
    },
  });

  // Confirm it's you: a right answer goes on to send the code to the address typed before the User was asked.
  const confirmIt = useMutation({
    mutationFn: (answer: ConfirmAnswer) => api.confirmItsYou(answer),
    onSuccess: () => send.mutate(newEmail.trim()),
  });

  // The window can't close while any of them is out, so no answer lands after the User has gone.
  const busy = send.isPending || confirm.isPending || confirmIt.isPending;

  /**
   * Back to the new address, keeping what was typed so a typo can be fixed. Off while a request is out, so its answer
   * can't land on the step the User moved to.
   */
  function backToEmail() {
    if (busy) return;
    setEmailError(null);
    setStep("email");
  }

  const confirming = confirmHeading(confirmPhase, confirmRecovery);
  const title =
    step === "confirm"
      ? confirming.title
      : step === "email"
        ? "Change your email"
        : step === "code"
          ? "Check your new inbox"
          : "This code has expired";

  return (
    <WindowFrame
      opened={opened}
      onClose={busy ? () => {} : onClose}
      title={
        <>
          <Stepper step={step === "confirm" ? 1 : step === "email" ? 2 : 3} />
          <span className={setup.titleText}>{title}</span>
          <span className={setup.subtitle}>
            {step === "confirm" ? (
              confirming.subtitle
            ) : step === "email" ? (
              "We’ll send a code to the new address. Your email only changes once you enter it."
            ) : step === "code" ? (
              <>
                We sent a 6-digit code to <span className={classes.address}>{sentTo}</span>.
                {codeError === null && " It expires in 15 minutes."}
              </>
            ) : (
              <>
                Codes last 15 minutes. Send a new one to{" "}
                <span className={classes.address}>{sentTo}</span>.
              </>
            )}
          </span>
        </>
      }
    >
      {step === "confirm" ? (
        <ConfirmItsYouStep
          phase={confirmPhase}
          onPhase={setConfirmPhase}
          recovery={confirmRecovery}
          onRecovery={setConfirmRecovery}
          confirm={(answer, onError) => confirmIt.mutate(answer, { onError })}
          busy={busy}
          onSignInAgain={onReauthRequired}
          onBack={backToEmail}
        />
      ) : step === "email" ? (
        <form
          className={`${setup.body} ${classes.body}`}
          onSubmit={(event) => {
            event.preventDefault();
            const email = newEmail.trim();
            if (email === "" || busy || waiting) return;
            send.mutate(email);
          }}
        >
          <div>
            <span className={classes.currentLabel}>Current email</span>
            <span className={classes.currentEmail}>{currentEmail}</span>
          </div>
          <TextInput
            label="New email"
            type="email"
            autoComplete="email"
            data-autofocus
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.currentTarget.value);
              setEmailError(null);
            }}
            error={emailError}
            disabled={busy}
          />
          {waiting ? (
            <div className={classes.alert} role="alert">
              <IconAlertCircle size={18} className={classes.noteMark} aria-hidden />
              Too many codes sent to this address. Try again in {clock(waitSeconds)}.
            </div>
          ) : (
            <div className={classes.note}>
              <IconInfoCircle size={18} className={classes.noteMark} aria-hidden />
              Only your email changes. Your password, two-step verification, sign-ins and connected
              Google or GitHub accounts stay as they are.
            </div>
          )}
          <div className={dialogs.footer}>
            <Button variant="default" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={send.isPending}
              disabled={newEmail.trim() === "" || waiting}
            >
              Send code
            </Button>
          </div>
        </form>
      ) : step === "code" ? (
        <form
          className={`${setup.body} ${classes.body}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length !== CODE_LENGTH || busy || codeError !== null) return;
            confirm.mutate(code);
          }}
        >
          <div>
            <span className={setup.label} id="change-email-code-label">
              Enter the 6-digit code
            </span>
            <CodePinInput
              value={code}
              onChange={(value) => {
                setCode(value);
                setCodeError(null);
              }}
              disabled={busy}
              error={codeError !== null}
              inWindow
              aria-labelledby="change-email-code-label"
            />
            {codeError && (
              <div className={classes.error} role="alert">
                {codeError}
              </div>
            )}
            <div className={classes.codeLinks}>
              {resendSeconds > 0 ? (
                <span className={classes.wait}>Resend code in {clock(resendSeconds)}</span>
              ) : (
                <Anchor
                  component="button"
                  type="button"
                  onClick={() => {
                    if (!busy) send.mutate(sentTo);
                  }}
                >
                  Resend code
                </Anchor>
              )}
              <Anchor
                component="button"
                type="button"
                onClick={backToEmail}
                aria-disabled={busy}
                c={busy ? "dimmed" : undefined}
              >
                Use a different email
              </Anchor>
            </div>
          </div>
          <div className={dialogs.footer}>
            <Button variant="default" onClick={backToEmail} disabled={busy}>
              Back
            </Button>
            <Button
              type="submit"
              loading={confirm.isPending}
              disabled={code.length !== CODE_LENGTH || codeError !== null}
            >
              Change email
            </Button>
          </div>
        </form>
      ) : (
        <div className={`${setup.body} ${classes.body}`}>
          <div className={classes.expiredPin} aria-hidden>
            <CodePinInput value="" onChange={() => {}} disabled inWindow />
          </div>
          {codeError && (
            <div className={classes.error} role="alert">
              {codeError}
            </div>
          )}
          <div className={dialogs.footer}>
            <Button variant="default" onClick={backToEmail} disabled={busy}>
              Use a different email
            </Button>
            {/* The wait shows on the button, so a refused send never looks like nothing happened. */}
            <Button
              loading={send.isPending}
              disabled={resendSeconds > 0}
              onClick={() => send.mutate(sentTo)}
            >
              {resendSeconds > 0 ? `Send a new code in ${clock(resendSeconds)}` : "Send a new code"}
            </Button>
          </div>
        </div>
      )}
    </WindowFrame>
  );
}

const STEPS = ["Confirm it’s you", "New email", "Enter code"] as const;

/**
 * "1 Confirm it's you — 2 New email — 3 Enter code" over the title. Read out as part of the title would repeat it,
 * so it is hidden from screen readers; the title says where the User is.
 */
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className={classes.stepper} aria-hidden>
      {STEPS.map((label, index) => {
        const number = index + 1;
        const state = number < step ? classes.done : number === step ? classes.current : "";
        return (
          <li key={label} className={`${classes.step} ${state}`}>
            <span className={classes.stepMark}>
              {number < step ? <IconCheck size={12} stroke={3} /> : number}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
