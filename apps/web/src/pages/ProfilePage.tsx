import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Panel } from "@repo/ui/panel";
import { useSession } from "../auth/useSession";
import { useSignInAgain } from "../auth/useSignInAgain";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";
import { passwordChangedText } from "../settings/profileView";
import { PASSWORD_PARAM } from "../settings/sections";
import { ChangeEmailDialog } from "./ChangeEmailDialog";
import { DisplayNameDialog } from "./DisplayNameDialog";
import { PasswordDialog } from "./PasswordDialog";
import { ProfilePictureCard } from "./ProfilePictureCard";
import { ReauthDialog } from "./ReauthDialog";
import card from "./SecurityPage.module.css";
import classes from "./ProfilePage.module.css";

/**
 * Settings → Profile (designs 39a and 35a): the Profile picture card, then a card with the User's Display name, email
 * and password, each with a button that opens its window.
 */
export default function ProfilePage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [nameOpen, setNameOpen] = useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(() => params.has(PASSWORD_PARAM));
  const [reauthOpen, setReauthOpen] = useState(false);
  // "Last changed" counts from when the page opened; a password set since is newer, so it reads "just now".
  const [openedAt] = useState(() => new Date());
  const signInAgain = useSignInAgain("/settings/profile");
  if (!user) return null;

  function closePassword() {
    setPasswordOpen(false);
    // So a reload or Back doesn't open it again.
    if (params.has(PASSWORD_PARAM)) setParams({}, { replace: true });
  }

  return (
    <Container size="sm" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={settingsCrumbs("Profile")} />
        <div>
          <Title order={1} fz={32} lh={1.1}>
            Profile
          </Title>
          <Text c="var(--color-accent-2-700)" mt={6}>
            How you appear to your team.
          </Text>
        </div>
        <ProfilePictureCard user={user} />
        <section aria-label="Account">
          <Panel p={0}>
            <ul className={card.list}>
              <li className={card.row}>
                <div className={card.text}>
                  <div className={card.name}>Display name</div>
                  <div className={card.detail}>{user.displayName}</div>
                </div>
                <Button
                  variant="default"
                  className={card.rowAction}
                  onClick={() => setNameOpen(true)}
                >
                  Edit
                </Button>
              </li>
              <li className={card.row}>
                <div className={card.text}>
                  <div className={card.name}>
                    <span>Email</span>
                    {user.emailVerified && <span className={card.badge}>Verified</span>}
                  </div>
                  <div className={card.detail}>{user.email}</div>
                </div>
                <Button
                  variant="default"
                  className={card.rowAction}
                  onClick={() => setChangeEmailOpen(true)}
                >
                  Change email
                </Button>
              </li>
              <li className={card.row}>
                <div className={card.text}>
                  <div className={card.name}>Password</div>
                  <div className={card.detail}>
                    {user.hasPassword ? (
                      <>
                        <span className={classes.dots}>••••••••</span>
                        {/* Unknown for a password set before Nimbus kept the time. */}
                        {user.passwordChangedAt &&
                          ` · ${passwordChangedText(user.passwordChangedAt, openedAt)}`}
                      </>
                    ) : (
                      "Not set · you sign in with Google or GitHub"
                    )}
                  </div>
                </div>
                <Button
                  variant="default"
                  className={card.rowAction}
                  onClick={() => setPasswordOpen(true)}
                >
                  {user.hasPassword ? "Change password" : "Set a password"}
                </Button>
              </li>
            </ul>
          </Panel>
        </section>
      </Stack>
      <DisplayNameDialog
        opened={nameOpen}
        current={user.displayName}
        onClose={() => setNameOpen(false)}
      />
      <ChangeEmailDialog
        opened={changeEmailOpen}
        currentEmail={user.email}
        onClose={() => setChangeEmailOpen(false)}
        onReauthRequired={() => {
          setChangeEmailOpen(false);
          setReauthOpen(true);
        }}
      />
      <PasswordDialog opened={passwordOpen} onClose={closePassword} />
      <ReauthDialog
        opened={reauthOpen}
        title="Sign in again to change your email"
        subtitle="You signed in a while ago. Sign in again, then change your email."
        busy={signInAgain.isPending}
        onConfirm={() => signInAgain.mutate()}
        onClose={() => setReauthOpen(false)}
      />
    </Container>
  );
}
