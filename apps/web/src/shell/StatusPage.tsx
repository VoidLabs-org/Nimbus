import { Button, Title } from "@mantine/core";
import { ArrowButton } from "@repo/ui/arrow-button";
import type { ReactNode } from "react";
import { Link } from "react-router";
import classes from "./StatusPage.module.css";

/**
 * An error or status page (design 27): the eyebrow, headline, text, an optional note and any buttons on the left;
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
  actions?: ReactNode;
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
        {actions && <div className={classes.actions}>{actions}</div>}
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

/** Where an action goes: a link with `to`, a button with `onClick`. */
type ActionTarget = { to: string; onClick?: never } | { onClick: () => void; to?: never };

/** The button's props for its target: its click, or a router link drawn in place of the button element. */
function target({ to, onClick }: ActionTarget) {
  return {
    onClick,
    renderRoot:
      to === undefined
        ? undefined
        : (props: Record<string, unknown>) => <Link to={to} {...props} />,
  };
}

/** The page's main action, an orange pill with a round arrow. */
export function PrimaryAction({
  children,
  ...action
}: Readonly<ActionTarget & { children: ReactNode }>) {
  return (
    <ArrowButton className={classes.primary} {...target(action)}>
      {children}
    </ArrowButton>
  );
}

/** A quieter action beside it. */
export function SecondaryAction({
  children,
  ...action
}: Readonly<ActionTarget & { children: ReactNode }>) {
  return (
    <Button className={classes.secondary} {...target(action)}>
      {children}
    </Button>
  );
}
