import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { PROVIDERS } from "../auth/providers";
import { useLinkedIdentities, useProviders } from "../api/queries";
import classes from "./SecurityPage.module.css";

/**
 * Security → Connected accounts: which of Google and GitHub can sign in as the User ("Connected as ..."), and the
 * ones that could. Its own card, so a failure here leaves the sessions above it alone. The rows are the providers the
 * server has switched on plus any connected one that has since been switched off, Google first; the card is gone
 * when there are none. If the server can't say which providers are on, the connected ones still show.
 */
export function ConnectedAccountsCard() {
  const providers = useProviders();
  const identities = useLinkedIdentities();

  if (identities.isError && identities.data === undefined) {
    return (
      <Card>
        <Panel p={0}>
          <div className={classes.problem}>
            <span>Couldn’t load your connected accounts.</span>
            <Button
              variant="default"
              loading={identities.isFetching}
              onClick={() => void identities.refetch()}
            >
              Try again
            </Button>
          </div>
        </Panel>
      </Card>
    );
  }
  if (identities.data === undefined || providers.isPending) {
    return (
      <Card>
        <Loading>
          <Panel p={0}>
            {[0, 1].map((row) => (
              <div key={row} className={classes.row}>
                <Bone h={40} w={40} circle />
                <div className={classes.text}>
                  <Bone h={15} w={100} />
                  <Bone h={13} w={200} mt={8} />
                </div>
              </div>
            ))}
          </Panel>
        </Loading>
      </Card>
    );
  }

  const enabled = providers.data ?? [];
  const connected = new Map(identities.data.map((identity) => [identity.provider, identity]));
  const rows = PROVIDERS.filter(
    (provider) => enabled.includes(provider.id) || connected.has(provider.id),
  );
  if (rows.length === 0) return null;

  return (
    <Card>
      <Panel p={0}>
        <ul className={classes.list}>
          {rows.map((provider) => {
            const identity = connected.get(provider.id);
            return (
              <li key={provider.id} className={classes.row}>
                <span className={classes.icon} aria-hidden="true">
                  {provider.icon}
                </span>
                <div className={classes.text}>
                  <div className={classes.name}>{provider.name}</div>
                  <div className={classes.detail}>
                    {!identity
                      ? "Not connected"
                      : identity.accountName
                        ? `Connected as ${identity.accountName}`
                        : "Connected"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className={classes.section} aria-labelledby="connected-accounts-heading">
      <div className={classes.sectionHead}>
        <div>
          <h2 id="connected-accounts-heading" className={classes.heading}>
            Connected accounts
          </h2>
          <div className={classes.description}>
            Sign in with Google or GitHub instead of your password.
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
