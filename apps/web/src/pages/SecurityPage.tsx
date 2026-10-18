import { IconDeviceDesktop, IconDeviceMobile } from "@tabler/icons-react";
import { Container, Stack, Title } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { loadFailure, useSessions } from "../api/queries";
import { activityText, isPhone, signedInText } from "../settings/sessionView";
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
  const error = loadFailure(query);
  if (error) return <FailedLoadPage failure={error} onRetry={() => void query.refetch()} />;

  // "Ago" is measured from when the list was fetched, so what is on screen is consistent with itself.
  const now = new Date(query.dataUpdatedAt);
  const sessions = query.data;

  return (
    <Container size="sm" px={0} py="xl">
      <Stack gap="lg" maw={760}>
        <BreadcrumbTrail crumbs={settingsCrumbs("Security")} />
        <Title order={1} fz={32} lh={1.1}>
          Security
        </Title>
        <section className={classes.section} aria-labelledby="signed-in-heading">
          <div>
            <h2 id="signed-in-heading" className={classes.heading}>
              Where you’re signed in
            </h2>
            <div className={classes.description}>Sign out anything you don’t recognise.</div>
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
                        {signedInText(session.startedAt, now)} · {activityText(session, now)}
                      </div>
                    </div>
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
