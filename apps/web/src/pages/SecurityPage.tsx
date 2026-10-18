import { IconDeviceDesktop, IconDeviceMobile } from "@tabler/icons-react";
import { Button, Container, Stack, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@repo/ui/toast";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { ApiError, api, type SessionInfo } from "../api/client";
import { loadFailure, queryKeys, useSessions } from "../api/queries";
import { activityText, isPhone, sessionName, signedInText } from "../settings/sessionView";
import { SignOutOthersDialog } from "./SignOutOthersDialog";
import { settingsCrumbs } from "../settings/crumbs";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { FailedLoadPage } from "../shell/StatusPages";
import classes from "./SecurityPage.module.css";

/**
 * Settings → Security: where the User is signed in, this browser first. The place for the rest of the account's
 * security (connected accounts, two-step sign-in) as those arrive.
 */
export default function SecurityPage() {
  const query = useSessions();
  const client = useQueryClient();
  const [signingOut, setSigningOut] = useState<string | null>(null);
  // The devices the dialog was opened with: what the User agrees to is what they were shown, not a later refetch.
  const [confirmingOthers, setConfirmingOthers] = useState<SessionInfo[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const error = loadFailure(query);
  if (error) return <FailedLoadPage failure={error} onRetry={() => void query.refetch()} />;

  // Only for the date of a sign-in (and whether it was this year); how long ago a session was active comes from the server.
  const now = new Date(query.dataUpdatedAt);
  const sessions = query.data;
  const others = sessions?.filter((session) => !session.current) ?? [];

  async function signOut(session: SessionInfo) {
    const name = sessionName(session, now);
    setSigningOut(session.id);
    try {
      await api.endSession(session.id);
      toast.success(`Signed out ${name}.`);
    } catch (failure) {
      // A 401 means this session ended too: the app is already sending the User to sign in again.
      if (failure instanceof ApiError && failure.status === 401) {
        setSigningOut(null);
        return;
      }
      if (failure instanceof ApiError && failure.status === 404) {
        // Already over (another tab, or it expired): nothing went wrong, and the list below is what's left.
        toast.info(`${name} was already signed out.`);
      } else {
        toast.error("Couldn't sign out that device. Please try again.");
        setSigningOut(null);
        return;
      }
    }
    await client.invalidateQueries({ queryKey: queryKeys.sessions });
    setSigningOut(null);
  }

  async function signOutOthers() {
    setSigningOutOthers(true);
    try {
      await api.endOtherSessions();
    } catch (failure) {
      setSigningOutOthers(false);
      // A 401 means this session ended too: the app is already sending the User to sign in again.
      if (!(failure instanceof ApiError && failure.status === 401))
        toast.error("Couldn't sign out your other devices. Please try again.");
      return;
    }
    toast.success("Signed out your other devices.");
    setConfirmOpen(false);
    setSigningOutOthers(false);
    await client.invalidateQueries({ queryKey: queryKeys.sessions });
  }

  return (
    <Container size="sm" px={0} py="xl">
      <Stack gap="lg" maw={760}>
        <BreadcrumbTrail crumbs={settingsCrumbs("Security")} />
        <Title order={1} fz={32} lh={1.1}>
          Security
        </Title>
        <section className={classes.section} aria-labelledby="signed-in-heading">
          <div className={classes.sectionHead}>
            <div>
              <h2 id="signed-in-heading" className={classes.heading}>
                Where you’re signed in
              </h2>
              <div className={classes.description}>Sign out anything you don’t recognise.</div>
            </div>
            {others.length > 0 && (
              <Button
                variant="default"
                className={classes.signOutOthers}
                disabled={signingOut !== null}
                onClick={() => {
                  setConfirmingOthers(others);
                  setConfirmOpen(true);
                }}
              >
                Sign out all other devices
              </Button>
            )}
          </div>
          {!sessions && (
            <Loading>
              <SessionsSkeleton />
            </Loading>
          )}
          {sessions && (
            <Panel p={0}>
              <ul className={classes.list}>
                {sessions.map((session) => (
                  <li key={session.id} className={classes.row}>
                    <span className={classes.icon} aria-hidden="true">
                      <Glyph
                        icon={isPhone(session.device) ? IconDeviceMobile : IconDeviceDesktop}
                      />
                    </span>
                    <div className={classes.text}>
                      <div className={classes.name}>
                        {session.device}
                        {session.current && <span className={classes.badge}>This device</span>}
                      </div>
                      <div className={classes.detail}>
                        {signedInText(session.startedAt, now)} · {activityText(session)}
                      </div>
                    </div>
                    {!session.current && (
                      <Button
                        variant="default"
                        className={classes.signOut}
                        loading={signingOut === session.id}
                        disabled={signingOut !== null || signingOutOthers}
                        aria-label={`Sign out ${sessionName(session, now)}`}
                        onClick={() => void signOut(session)}
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {sessions.length > 0 && sessions.every((session) => session.current) && (
                <p className={classes.alone}>You’re not signed in anywhere else.</p>
              )}
            </Panel>
          )}
        </section>
      </Stack>
      <SignOutOthersDialog
        opened={confirmOpen}
        others={confirmingOthers}
        now={now}
        busy={signingOutOthers}
        onConfirm={() => void signOutOthers()}
        onClose={() => setConfirmOpen(false)}
      />
    </Container>
  );
}

/** Two rows in the shape of the list, so the sessions land without moving anything. */
function SessionsSkeleton() {
  return (
    <Panel p={0}>
      {[0, 1].map((row) => (
        <div key={row} className={classes.row}>
          <Bone h={40} w={40} circle />
          <div className={classes.text}>
            <Bone h={15} w={160} />
            <Bone h={13} w={220} mt={8} />
          </div>
        </div>
      ))}
    </Panel>
  );
}
