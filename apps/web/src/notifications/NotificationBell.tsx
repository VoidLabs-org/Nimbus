import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Popover,
  Text,
  UnstyledButton,
  type PopoverProps,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconBell, IconCheck, IconShieldLock } from "@tabler/icons-react";
import { Glyph } from "@repo/ui/glyph";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type NotificationPage } from "../api/client";
import { queryKeys } from "../api/queries";
import classes from "./NotificationBell.module.css";

export function NotificationBell({ position }: { position: PopoverProps["position"] }) {
  const [opened, setOpened] = useState(false);
  const phone = useMediaQuery("(max-width: 48em)");
  const navigate = useNavigate();
  const cache = useQueryClient();
  const count = useQuery({
    queryKey: queryKeys.notificationUnreadCount,
    queryFn: () => api.notificationUnreadCount(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
  const refetchCount = count.refetch;
  useEffect(() => {
    // Query also observes tab visibility; a window can regain focus without becoming visible again.
    const refresh = () => {
      void refetchCount({ cancelRefetch: false });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refetchCount]);
  const list = useInfiniteQuery({
    queryKey: queryKeys.notificationList,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: opened,
    staleTime: 0,
  });
  const changed = () => cache.invalidateQueries({ queryKey: queryKeys.notifications });
  const read = useMutation({
    mutationFn: (id: string) => api.readNotification(id),
    onSuccess: changed,
  });
  const readAll = useMutation({ mutationFn: () => api.readAllNotifications(), onSuccess: changed });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const day = dayLabel(item.createdAt);
    const group = groups.get(day) ?? [];
    group.push(item);
    groups.set(day, group);
  }
  function toggle() {
    if (!opened) {
      cache.setQueryData<InfiniteData<NotificationPage>>(queryKeys.notificationList, (old) =>
        old
          ? {
              pages: old.pages.slice(0, 1),
              pageParams: old.pageParams.slice(0, 1),
            }
          : old,
      );
    }
    setOpened(!opened);
  }
  const unread = count.data?.count ?? 0;
  const button = (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="lg"
      className={classes.bell}
      aria-label={`Notifications, ${unread} unread`}
      aria-expanded={opened}
      aria-haspopup="dialog"
      data-nav-focus="notifications"
      onClick={toggle}
    >
      <Glyph icon={IconBell} size={21} />
      {unread > 0 && <span className={classes.badge}>{unread > 9 ? "9+" : unread}</span>}
    </ActionIcon>
  );
  const panel = (
    <div className={classes.panel}>
      <Group justify="space-between" p="md">
        <Text fw={650}>Notifications</Text>
        <Button
          variant="subtle"
          size="compact-xs"
          disabled={unread === 0}
          loading={readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          Mark all as read
        </Button>
      </Group>
      {(read.isError || readAll.isError) && (
        <Text p="sm" c="red" role="alert">
          Couldn't mark Notifications as read. Try again.
        </Text>
      )}
      <div
        className={classes.body}
        role="region"
        aria-label="Notification list"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (
            el.scrollHeight - el.scrollTop - el.clientHeight < 80 &&
            list.hasNextPage &&
            !list.isFetching
          )
            void list.fetchNextPage();
        }}
      >
        {list.isPending ? (
          <Text p="lg" role="status">
            Loading Notifications…
          </Text>
        ) : list.isError && !list.data ? (
          <Button variant="subtle" onClick={() => void list.refetch()}>
            Couldn't load Notifications. Try again
          </Button>
        ) : items.length === 0 ? (
          <div className={classes.empty}>
            <Glyph icon={IconCheck} size={30} />
            <h3>You're all caught up</h3>
            <p>
              We'll let you know when an Issue you reported or are assigned to changes, or something
              happens to your account.
            </p>
          </div>
        ) : (
          [...groups].map(([day, rows]) => (
            <section key={day} aria-label={day}>
              <h3 className={classes.day}>{day}</h3>
              {rows.map((item) => (
                <UnstyledButton
                  key={item.id}
                  className={classes.row}
                  data-unread={!item.read || undefined}
                  disabled={read.isPending}
                  onClick={() =>
                    read.mutate(item.id, {
                      onSuccess: () => {
                        setOpened(false);
                        navigate(item.link);
                      },
                    })
                  }
                >
                  <span className={classes.securityIcon}>
                    <Glyph icon={IconShieldLock} size={20} />
                  </span>
                  <span className={classes.rowText}>
                    <strong>{item.snapshot.title}</strong>
                    <span>{item.snapshot.deviceLabel}</span>
                    <time
                      dateTime={item.createdAt}
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      {timeAgo(item.createdAt)}
                    </time>
                  </span>
                  {!item.read && <span className={classes.dot} aria-label="Unread" />}
                </UnstyledButton>
              ))}
            </section>
          ))
        )}
        {list.isFetchingNextPage && (
          <Text p="sm" size="sm" role="status">
            Loading older Notifications…
          </Text>
        )}
        {list.hasNextPage && (
          <Button
            variant="subtle"
            fullWidth
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Load older Notifications
          </Button>
        )}
        {list.isRefetchError && (
          <Text p="sm" size="sm" role="alert">
            Couldn't refresh Notifications. Try again.
          </Text>
        )}
      </div>
      <Group justify="space-between" p="md" className={classes.footer}>
        <Text size="xs">Kept for 90 days</Text>
        <Link to="/settings/notifications" data-autofocus onClick={() => setOpened(false)}>
          Email settings
        </Link>
      </Group>
    </div>
  );
  if (phone)
    return (
      <>
        {button}
        <Drawer
          opened={opened}
          onClose={() => setOpened(false)}
          position="bottom"
          size="85dvh"
          title="Notifications"
          closeButtonProps={{ "aria-label": "Close Notifications" }}
          padding={0}
          classNames={{ content: classes.sheet }}
        >
          {panel}
        </Drawer>
      </>
    );
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position={position}
      width={400}
      trapFocus
      shadow="md"
    >
      <Popover.Target>{button}</Popover.Target>
      <Popover.Dropdown p={0} className={classes.dropdown} role="dialog" aria-label="Notifications">
        {panel}
      </Popover.Dropdown>
    </Popover>
  );
}

function dayLabel(at: string) {
  const date = new Date(at);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(at: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
