import { Button, Title } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { IconArrowRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import classes from "./StatusPage.module.css";

/**
 * An error or status page (design 27): the eyebrow, headline, text, an optional note and the buttons on the left;
 * the three bars from sign-in on the right, naming what happened (`code`, then `name`). `standalone` fills the
 * window, for the pages shown without the navbar.
 */
export function StatusPage({
  eyebrow,
  title,
  body,
  note,
  actions,
  code,
  name,
  standalone = false,
}: Readonly<{
  eyebrow: string;
  title: string;
  body: string;
  note?: ReactNode;
  actions: ReactNode;
  code: string;
  name: string;
  standalone?: boolean;
}>) {
  return (
    <div className={standalone ? `${classes.page} ${classes.standalone}` : classes.page}>
      <div className={classes.text}>
        <div className={classes.eyebrow}>{eyebrow}</div>
        <Title order={1} className={classes.title}>
          {title}
        </Title>
        <div className={classes.body}>{body}</div>
        {note}
        <div className={classes.actions}>{actions}</div>
      </div>
      <div className={classes.bars} aria-hidden>
        <span className={`${classes.bar} ${classes.code}`}>{code}</span>
        <span className={`${classes.bar} ${classes.name}`}>{name}</span>
        <span className={`${classes.bar} ${classes.empty}`} />
      </div>
    </div>
  );
}

/** A line under the text, such as "Trying again in 8s"; `dot` adds the red dot before it. */
export function StatusNote({
  dot = false,
  children,
}: Readonly<{ dot?: boolean; children: ReactNode }>) {
  return (
    <div className={classes.note} data-dot={dot || undefined}>
      {children}
    </div>
  );
}

const arrow = (
  <span className={classes.arrow}>
    <Glyph icon={IconArrowRight} />
  </span>
);

/** The page's main action, an orange pill with a round arrow: a link with `to`, a button with `onClick`. */
export function PrimaryAction({
  to,
  onClick,
  children,
}: Readonly<{ to?: string; onClick?: () => void; children: ReactNode }>) {
  return to ? (
    <Button component={Link} to={to} className={classes.primary} rightSection={arrow}>
      {children}
    </Button>
  ) : (
    <Button onClick={onClick} className={classes.primary} rightSection={arrow}>
      {children}
    </Button>
  );
}

/** A quieter action beside it: a link with `to`, a button with `onClick`. */
export function SecondaryAction({
  to,
  onClick,
  children,
}: Readonly<{ to?: string; onClick?: () => void; children: ReactNode }>) {
  return to ? (
    <Button component={Link} to={to} className={classes.secondary}>
      {children}
    </Button>
  ) : (
    <Button onClick={onClick} className={classes.secondary}>
      {children}
    </Button>
  );
}
