import { IconDeviceMobile, IconKey } from "@tabler/icons-react";
import { Button } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { ApiError, api, type TwoStepSetup } from "../api/client";
import { queryKeys, useTwoStep } from "../api/queries";
import { useSignInAgain } from "../auth/useSignInAgain";
import { NewRecoveryCodesDialog } from "./NewRecoveryCodesDialog";
import { ReauthDialog } from "./ReauthDialog";
import { RemoveTwoStepDialog } from "./RemoveTwoStepDialog";
import { TwoStepSetupDialog } from "./TwoStepSetupDialog";
import classes from "./SecurityPage.module.css";

/** How many Recovery codes a set has. */
const RECOVERY_CODES = 10;

/** The address parameter that opens the setup window, set when the User went to sign in again first. */
const SETUP_PARAM = "setup";

/**
 * Security → Two-step verification (designs 32a and 32b): whether signing in also asks for a code from an
 * authenticator app, setting that up, removing it, and new Recovery codes. Its own card, so a failure here leaves the rest of the page alone.
 */
export function TwoStepCard() {
  const query = useTwoStep();
  const client = useQueryClient();
  const [setup, setSetup] = useState<TwoStepSetup | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [newCodesOpen, setNewCodesOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const start = useMutation({
    mutationFn: () => api.startTwoStepSetup(),
    onSuccess: (started) => {
      setSetup(started);
      setSetupOpen(true);
    },
    onError: (failure) => {
      // A 401 means this session ended: the app is already sending the User to sign in again.
      if (failure instanceof ApiError && failure.status === 401) return;
      if (failure instanceof ApiError && failure.code === "reauth_required") {
        setSetupOpen(false);
        setReauthOpen(true);
        return;
      }
      if (failure instanceof ApiError && failure.code === "already_on") {
        toast.info("Two-step verification is already on.");
        setSetupOpen(false);
        void client.invalidateQueries({ queryKey: queryKeys.twoStep });
        return;
      }
      toast.error("Couldn’t start setting up two-step verification. Please try again.");
    },
  });
  // Back here with the setup window asked for, so the User doesn't have to find Set up again.
  const signInAgain = useSignInAgain(`/settings/security?${SETUP_PARAM}=two-step`);

  // Coming back from signing in again: open the setup window by itself (unless it's on by now), once, and take the
  // parameter out of the address so a reload doesn't open it again.
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get(SETUP_PARAM) === "two-step";
  const handled = useRef(false);
  const loaded = query.data;
  useEffect(() => {
    if (!asked || handled.current || loaded === undefined) return;
    handled.current = true;
    if (!loaded.enabled) start.mutate();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(SETUP_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [asked, loaded, start, setSearchParams]);

  if (query.isError && query.data === undefined) {
    return (
      <Card on={false}>
        <Panel p={0}>
          <div className={classes.problem}>
            <span>Couldn’t load your two-step verification.</span>
            <Button
              variant="default"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        </Panel>
      </Card>
    );
  }
  if (query.data === undefined) {
    return (
      <Card on={false}>
        <Loading>
          <Panel p={0}>
            <div className={classes.row}>
              <Bone h={40} w={40} circle />
              <div className={classes.text}>
                <Bone h={15} w={140} />
                <Bone h={13} w={240} mt={8} />
              </div>
            </div>
          </Panel>
        </Loading>
      </Card>
    );
  }

  const status = query.data;
  return (
    <Card on={status.enabled}>
      <Panel p={0}>
        <ul className={classes.list}>
          <li className={classes.row}>
            <span className={classes.icon} aria-hidden="true">
              <Glyph icon={IconDeviceMobile} />
            </span>
            <div className={classes.text}>
              <div className={classes.name}>
                <span>Authenticator app</span>
                {status.enabled ? (
                  <span className={classes.badge}>On</span>
                ) : (
                  <span className={classes.offBadge}>Off</span>
                )}
              </div>
              <div className={classes.detail}>
                {status.enabled && status.enabledAt
                  ? `Added ${addedText(status.enabledAt)}`
                  : "Use Google Authenticator, 1Password, Authy or similar."}
              </div>
            </div>
            {status.enabled ? (
              <Button
                variant="default"
                className={classes.rowAction}
                onClick={() => setRemoveOpen(true)}
              >
                Remove
              </Button>
            ) : (
              <Button
                className={classes.setUp}
                loading={start.isPending && !setupOpen}
                disabled={start.isPending}
                onClick={() => start.mutate()}
              >
                Set up
              </Button>
            )}
          </li>
          {status.enabled && (
            <li className={classes.row}>
              <span className={classes.icon} aria-hidden="true">
                <Glyph icon={IconKey} />
              </span>
              <div className={classes.text}>
                <div className={classes.name}>Recovery codes</div>
                <div className={classes.detail}>
                  {status.recoveryCodesLeft ?? 0} of {RECOVERY_CODES} left
                </div>
              </div>
              <Button
                variant="default"
                className={classes.rowAction}
                onClick={() => setNewCodesOpen(true)}
              >
                View new codes
              </Button>
            </li>
          )}
        </ul>
      </Panel>
      <TwoStepSetupDialog
        opened={setupOpen}
        setup={setup}
        restarting={start.isPending}
        onRestart={() => start.mutate()}
        onClose={() => setSetupOpen(false)}
      />
      <NewRecoveryCodesDialog opened={newCodesOpen} onClose={() => setNewCodesOpen(false)} />
      <RemoveTwoStepDialog opened={removeOpen} onClose={() => setRemoveOpen(false)} />
      <ReauthDialog
        opened={reauthOpen}
        title="Sign in again to set up two-step verification"
        subtitle="For your security, setting up two-step verification needs a recent sign-in. You’ll come back to this page afterwards."
        busy={signInAgain.isPending}
        onConfirm={() => signInAgain.mutate()}
        onClose={() => setReauthOpen(false)}
      />
    </Card>
  );
}

/** "18 Oct 2026", in the viewer's locale. */
function addedText(enabledAt: string): string {
  return new Date(enabledAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Card({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <section className={classes.section} aria-labelledby="two-step-heading">
      <div className={classes.sectionHead}>
        <div>
          <h2 id="two-step-heading" className={classes.heading}>
            Two-step verification
          </h2>
          <div className={classes.description}>
            Ask for a code from an authenticator app when you sign in.
          </div>
        </div>
        {on && <span className={classes.badge}>On</span>}
      </div>
      {children}
    </section>
  );
}
