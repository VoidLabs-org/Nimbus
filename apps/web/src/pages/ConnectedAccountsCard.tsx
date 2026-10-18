import { Button } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { ApiError, api } from "../api/client";
import { connectErrorMessage } from "../api/messages";
import { PROVIDERS } from "../auth/providers";
import { loginPath } from "../auth/returnPath";
import { goTo } from "../auth/redirect";
import { useSession } from "../auth/useSession";
import { queryKeys, useLinkedIdentities, useProviders } from "../api/queries";
import { DisconnectDialog, SetPasswordFirstDialog } from "./DisconnectDialogs";
import { ReauthDialog } from "./ReauthDialog";
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
  const { user, logout } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // The provider whose "Sign in again" window is open (kept after closing so it still names it while fading).
  const [reauth, setReauth] = useState<{ id: string; open: boolean } | null>(null);
  const closeReauth = () => setReauth((current) => current && { ...current, open: false });

  // The server sends the browser back here with the result of a connect: tell the User, reload the list, and
  // take the parameters out of the address so a reload doesn't say it again.
  const handled = useRef(false);
  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");
  const providerParam = searchParams.get("provider");
  useEffect(() => {
    if (handled.current || (connectedParam === null && errorParam === null)) return;
    handled.current = true;
    if (connectedParam !== null) {
      const known = PROVIDERS.find((provider) => provider.id === connectedParam);
      toast.success(known ? `Connected ${known.name}.` : "Connected.");
    } else if (errorParam !== null) {
      const known = PROVIDERS.find((provider) => provider.id === providerParam);
      toast.error(connectErrorMessage(errorParam, known?.id ?? null));
    }
    void client.invalidateQueries({ queryKey: queryKeys.linkedIdentities });
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        ["connected", "error", "provider"].forEach((name) => next.delete(name));
        return next;
      },
      { replace: true },
    );
  }, [connectedParam, errorParam, providerParam, client, setSearchParams]);

  const connect = useMutation({
    mutationFn: (id: string) => api.linkTicket(id),
    onSuccess: ({ ticket }, id) => {
      // A full page load: the API starts the handshake and hands the browser on to the provider.
      goTo(`/api/auth/oauth2/${encodeURIComponent(id)}?link=${encodeURIComponent(ticket)}`);
    },
    onError: (failure, id) => {
      // A 401 means this session ended: the app is already sending the User to sign in again.
      if (failure instanceof ApiError && failure.status === 401) return;
      if (failure instanceof ApiError && failure.code === "reauth_required") {
        setReauth({ id, open: true });
        return;
      }
      if (failure instanceof ApiError && failure.status === 409) {
        // Connected elsewhere in the meantime: the list is what's true.
        void client.invalidateQueries({ queryKey: queryKeys.linkedIdentities });
        return;
      }
      toast.error(`Couldn’t start connecting ${nameOf(id)}. Please try again.`);
    },
  });
  const signInAgain = useMutation({
    mutationFn: async () => {
      await logout();
      void navigate(loginPath("/settings/security"));
    },
  });
  // The provider the open dialog is about, and which one: the question, or the "set a password first" answer.
  const [dialog, setDialog] = useState<{
    id: string;
    step: "confirm" | "password";
    open: boolean;
  } | null>(null);
  // Closing keeps the provider, so the window still names it while it fades out.
  const closeDialog = () => setDialog((current) => current && { ...current, open: false });
  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectProvider(id),
    onSuccess: (_, id) => {
      toast.success(`Disconnected ${nameOf(id)}.`);
      closeDialog();
      return client.invalidateQueries({ queryKey: queryKeys.linkedIdentities });
    },
    onError: (failure, id) => {
      // A 401 means this session ended: the app is already sending the User to sign in again.
      if (failure instanceof ApiError && failure.status === 401) return;
      if (failure instanceof ApiError && failure.code === "last_sign_in_method") {
        setDialog({ id, step: "password", open: true });
        return;
      }
      toast.error("Couldn’t disconnect. Please try again.");
    },
  });

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
                {!identity && (
                  <Button
                    variant="default"
                    className={classes.disconnect}
                    aria-label={`Connect ${provider.name}`}
                    loading={connect.isPending && connect.variables === provider.id}
                    disabled={connect.isPending}
                    onClick={() => connect.mutate(provider.id)}
                  >
                    Connect
                  </Button>
                )}
                {identity && (
                  <Button
                    variant="default"
                    className={classes.disconnect}
                    aria-label={`Disconnect ${provider.name}`}
                    onClick={() =>
                      // Their only way in: say so up front, not after a click that cannot work.
                      setDialog({
                        id: provider.id,
                        open: true,
                        step:
                          user?.hasPassword === false && identities.data.length === 1
                            ? "password"
                            : "confirm",
                      })
                    }
                  >
                    Disconnect
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      <DisconnectDialog
        opened={dialog?.step === "confirm" && dialog.open}
        provider={nameOf(dialog?.id ?? "")}
        busy={disconnect.isPending}
        onConfirm={() => dialog && disconnect.mutate(dialog.id)}
        onClose={closeDialog}
      />
      <ReauthDialog
        opened={reauth?.open === true}
        provider={nameOf(reauth?.id ?? "")}
        busy={signInAgain.isPending}
        onConfirm={() => signInAgain.mutate()}
        onClose={closeReauth}
      />
      <SetPasswordFirstDialog
        opened={dialog?.step === "password" && dialog.open}
        provider={nameOf(dialog?.id ?? "")}
        onClose={closeDialog}
      />
    </Card>
  );
}

function nameOf(id: string): string {
  return PROVIDERS.find((provider) => provider.id === id)?.name ?? id;
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
