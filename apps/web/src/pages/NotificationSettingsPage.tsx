import { IconLock, IconShieldLock } from "@tabler/icons-react";
import { Alert, Button, Container, Group, Stack, Switch, Table, Text, Title } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { api, type IssueNotificationType, type NotificationSetting } from "../api/client";
import { queryKeys, useNotificationSettings } from "../api/queries";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";

const ROWS: Record<IssueNotificationType, { name: string; description: string }> = {
  ISSUE_ASSIGNED: { name: "Assigned to you", description: "Sent right away." },
  ISSUE_UNASSIGNED: { name: "Unassigned from you", description: "You were taken off an Issue." },
  ISSUE_STATUS_CHANGED: {
    name: "Status changed",
    description: "An Issue you reported or are assigned to moved to a new status.",
  },
  ISSUE_EDITED: {
    name: "Edited",
    description: "Several changes in one save count once.",
  },
  ISSUE_DELETED: {
    name: "Deleted",
    description: "An Issue you reported or are assigned to was deleted.",
  },
};

/**
 * Settings → Notifications (design 38e): whether each Issue Notification is also emailed. In-app is always on, and
 * Security alerts are always on in both channels. Each switch saves as it changes, shown at once and rolled back with a
 * message if the server refuses.
 */
export default function NotificationSettingsPage() {
  const query = useNotificationSettings();
  const client = useQueryClient();
  const save = useMutation({
    mutationKey: ["saveNotificationSetting"],
    mutationFn: ({ type, email }: { type: IssueNotificationType; email: boolean }) =>
      api.saveNotificationSetting(type, email),
    onMutate: async ({ type, email }) => {
      await client.cancelQueries({ queryKey: queryKeys.notificationSettings });
      const before = client
        .getQueryData<NotificationSetting[]>(queryKeys.notificationSettings)
        ?.find((setting) => setting.type === type)?.email;
      setSwitch(type, email);
      return { before };
    },
    onError: (_failure, { type }, context) => {
      if (context?.before !== undefined) setSwitch(type, context.before);
      toast.error("Couldn’t save that change. Please try again.");
    },
    // Once the last save settles, take the server's word, so quick toggles or a refetch mid-save can't leave a stale switch.
    onSettled: () => {
      if (client.isMutating({ mutationKey: ["saveNotificationSetting"] }) === 1)
        void client.invalidateQueries({ queryKey: queryKeys.notificationSettings });
    },
  });

  function setSwitch(type: IssueNotificationType, email: boolean) {
    client.setQueryData<NotificationSetting[]>(queryKeys.notificationSettings, (old) =>
      old?.map((setting) => (setting.type === type ? { ...setting, email } : setting)),
    );
  }

  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={settingsCrumbs("Notifications")} />
        <div>
          <Title order={1}>Notifications</Title>
          <Text c="dimmed" mt={6}>
            Choose which Issue Notifications are also sent by email. Each change is saved as you
            make it.
          </Text>
        </div>
        {query.data === undefined && query.isError ? (
          <Alert color="red">
            <Group justify="space-between" gap="sm">
              Couldn’t load your Notification settings.
              <Button variant="default" size="xs" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </Group>
          </Alert>
        ) : query.data === undefined ? (
          <Loading>
            <Panel p="lg">
              <Stack gap="md">
                {Object.keys(ROWS).map((type) => (
                  <Bone key={type} h={40} />
                ))}
              </Stack>
            </Panel>
          </Loading>
        ) : (
          <Panel p="lg" role="region" aria-label="Issue Notifications">
            <Table verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Issue Notifications</Table.Th>
                  <Table.Th>In app</Table.Th>
                  <Table.Th>Email</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {query.data
                  .filter(({ type }) => type in ROWS)
                  .map(({ type, email }) => (
                    <Table.Tr key={type}>
                      <Table.Td>
                        <Text fw={600}>{ROWS[type].name}</Text>
                        <Text size="sm" c="dimmed">
                          {ROWS[type].description}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} c="dimmed">
                          <Glyph icon={IconLock} size={16} />
                          <Text size="sm">Always on</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          aria-label={`Email: ${ROWS[type].name}`}
                          checked={email}
                          onChange={(event) =>
                            save.mutate({ type, email: event.currentTarget.checked })
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </Panel>
        )}
        <Panel p="lg" role="region" aria-label="Security alerts">
          <Group gap="md" wrap="nowrap">
            <Glyph icon={IconShieldLock} size={24} />
            <div>
              <Text fw={600}>Security alerts</Text>
              <Text size="sm" c="dimmed">
                Always on, in app and email
              </Text>
            </div>
          </Group>
        </Panel>
      </Stack>
    </Container>
  );
}
