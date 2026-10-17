import {
  Alert,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Pagination,
  Stack,
  Title,
} from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AuditAvatar } from "../access/AuditAvatar";
import { AuditEntryModal } from "../access/AuditEntryModal";
import { describeAuditEntry } from "../access/auditText";
import { actorName, grantChips, groupByDay } from "../access/auditView";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { ApiError, api, type AuditEntry, type AuditPage } from "../api/client";
import classes from "./AuditLogPage.module.css";

const PAGE_SIZE = 50;

/**
 * Settings → Audit log: every change to Roles and their Permissions, newest first, with who made it. Entries are
 * kept for good and never edited. Only Users with access:audit:view get the list.
 */
export default function AuditLogPage() {
  const [opened, setOpened] = useState<AuditEntry | null>(null);
  const canOpenRoles = usePlatformPermissions().includes("access:role:manage");
  // `asOf` pins the set of entries the pages are cut from, so entries written meanwhile don't shift them; "Show newest"
  // starts a fresh set. A result or an error belongs to the page it was asked for, so switching pages never shows
  // the previous page's rows or an old error as if they were current.
  const [view, setView] = useState<{ page: number; asOf?: number }>({ page: 0 });
  const [result, setResult] = useState<{
    page: number;
    asOf?: number;
    loaded?: AuditPage;
    /** When it arrived, for Today and Yesterday. */
    now?: Date;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let current = true;
    api
      .auditLog(view.page, PAGE_SIZE, view.asOf)
      .then((loaded) => {
        if (current) setResult({ page: view.page, asOf: view.asOf, loaded, now: new Date() });
      })
      .catch((failure) => {
        if (!current) return;
        setResult({
          page: view.page,
          asOf: view.asOf,
          error:
            failure instanceof ApiError && failure.status === 403
              ? "You don't have permission to read the audit log."
              : "Couldn't load the audit log. Please try again.",
        });
      });
    return () => {
      current = false;
    };
  }, [view]);

  const current = result && result.page === view.page && result.asOf === view.asOf ? result : null;
  const loaded = current?.loaded ?? null;
  const error = current?.error ?? null;
  const pages = loaded ? Math.max(1, Math.ceil(loaded.total / PAGE_SIZE)) : 1;

  // Grouped per page, so a day that continues on the next page shows its heading there too.
  const days = loaded && current?.now ? groupByDay(loaded.entries, current.now) : [];

  return (
    <Container size="lg" px={0} py="xl">
      <Stack gap="lg">
        <div className={classes.header}>
          <div>
            <Title order={1} fz={40} lh={1.05}>
              Audit log
            </Title>
            <div className={classes.description}>
              Every change to Roles and their Permissions, newest first. Entries are never edited or
              deleted.
            </div>
          </div>
          <Button variant="default" onClick={() => setView({ page: 0 })}>
            Show newest
          </Button>
        </div>
        {error && <Alert color="red">{error}</Alert>}
        {!loaded && !error && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {loaded && loaded.entries.length === 0 && (
          <Panel p={8}>
            <p className={classes.empty}>Nothing has changed yet.</p>
          </Panel>
        )}
        {loaded && loaded.entries.length > 0 && (
          <>
            <Panel p={8}>
              {days.map((day) => (
                <section key={day.key} aria-label={day.label}>
                  <h2 className={classes.day}>{day.label}</h2>
                  <ul className={classes.list}>
                    {day.entries.map((entry) => (
                      <AuditRow
                        key={entry.id}
                        entry={entry}
                        canOpenRoles={canOpenRoles}
                        onOpen={() => setOpened(entry)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </Panel>
            {pages > 1 && (
              <Group justify="center">
                <Pagination
                  total={pages}
                  value={view.page + 1}
                  onChange={(value) =>
                    setView({ page: value - 1, asOf: loaded?.asOf ?? view.asOf })
                  }
                />
              </Group>
            )}
          </>
        )}
      </Stack>
      {opened && <AuditEntryModal entry={opened} onClose={() => setOpened(null)} />}
    </Container>
  );
}

/**
 * One entry: time, who, the summary (a button that opens the entry in full, stretched over the row), up to three
 * Grant chips, the Role as a pill (a link only while the Role exists and the User may open Roles) and an arrow.
 */
function AuditRow({
  entry,
  canOpenRoles,
  onOpen,
}: {
  entry: AuditEntry;
  canOpenRoles: boolean;
  onOpen: () => void;
}) {
  const { chips, more } = grantChips(entry);
  return (
    <li className={classes.row}>
      <time className={classes.time} dateTime={entry.at}>
        {new Date(entry.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </time>
      <span className={entry.actor ? classes.who : `${classes.who} ${classes.system}`}>
        <AuditAvatar actor={entry.actor} />
        {actorName(entry)}
      </span>
      <div className={classes.what}>
        <button type="button" className={classes.open} onClick={onOpen}>
          {describeAuditEntry(entry)}
        </button>
        {chips.length > 0 && (
          <div className={classes.chips}>
            {chips.map((chip) => (
              <span key={chip.permission} className={`${classes.chip} ${classes[chip.kind]}`}>
                {chip.kind === "added" ? "+" : "−"} {chip.permission}
                {chip.scope && ` · ${chip.scope}`}
              </span>
            ))}
            {more > 0 && <span className={classes.more}>+{more} more</span>}
          </div>
        )}
      </div>
      {entry.target.exists && canOpenRoles ? (
        <Link to={`/settings/roles/${entry.target.key}`} className={classes.role}>
          {entry.target.key}
        </Link>
      ) : (
        <span className={classes.role}>{entry.target.key}</span>
      )}
      <span className={classes.arrow} aria-hidden>
        →
      </span>
    </li>
  );
}
