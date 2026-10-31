import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { FailedLoad } from "@repo/api";
import { loginPath, safeReturnPath } from "../auth/returnPath";
import { PrimaryAction, SecondaryAction, StatusNote, StatusPage } from "./StatusPage";

/**
 * Go back where the User came from, shown only when that was a page in Nimbus: a link opened in a new tab lands on
 * the first entry of its history (React Router's "default" key), and going back from there would do nothing or
 * leave Nimbus.
 */
function GoBack() {
  const navigate = useNavigate();
  const { key } = useLocation();
  if (key === "default") return null;
  return <SecondaryAction onClick={() => navigate(-1)}>Go back</SecondaryAction>;
}

/** 27a: the address, or the thing it points at, doesn't exist. */
export function NotFoundPage() {
  return (
    <StatusPage
      eyebrow="Error 404"
      title="This page isn’t here."
      body="The link may be old, or the page was moved or deleted."
      code="404"
      name="Not found"
      actions={
        <>
          <PrimaryAction to="/">Go home</PrimaryAction>
          <GoBack />
        </>
      }
    />
  );
}

/** 27b: the server refused to show it to this User. */
export function NoAccessPage() {
  return (
    <StatusPage
      eyebrow="Error 403"
      title="You don’t have access."
      body="You don’t have permission to view this page. If you think you should, ask a workspace admin."
      code="403"
      name="No access"
      actions={
        <>
          <PrimaryAction to="/">Go home</PrimaryAction>
          <GoBack />
        </>
      }
    />
  );
}

/**
 * 27c: the server failed. Try again calls `onRetry`, which loads the page again. Without the navbar (`standalone`)
 * there is no home to go to, so only Try again shows.
 */
export function ServerErrorPage({
  onRetry,
  standalone = false,
}: Readonly<{ onRetry: () => void; standalone?: boolean }>) {
  return (
    <StatusPage
      eyebrow="Error 500"
      title="Something went wrong on our side."
      body="Nothing you did caused this. Try again in a moment."
      code="500"
      name="Server error"
      standalone={standalone}
      actions={
        <>
          <PrimaryAction onClick={onRetry}>Try again</PrimaryAction>
          {!standalone && <SecondaryAction to="/">Go home</SecondaryAction>}
        </>
      }
    />
  );
}

/**
 * A page that crashed while drawing: a bug in the app, so it doesn't blame the server (27c's layout, "Something
 * broke"). Try again draws the page afresh.
 */
export function CrashedPage({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <StatusPage
      eyebrow="Something broke"
      title="This page ran into a problem."
      body="It wasn’t something you did. Try again, or go home and come back to it."
      code="Error"
      name="Something broke"
      actions={
        <>
          <PrimaryAction onClick={onRetry}>Try again</PrimaryAction>
          <SecondaryAction to="/">Go home</SecondaryAction>
        </>
      }
    />
  );
}

/** Seconds between automatic tries while offline. */
const RETRY_SECONDS = 8;

const OFFLINE = {
  eyebrow: "No connection",
  title: "You’re offline.",
  body: "Check your internet connection. Nimbus will reconnect automatically.",
  code: "Offline",
  name: "reconnecting",
};

/**
 * 27e: no connection. With `onRetry` (a request to send again) it tries every few seconds by itself, counting down,
 * and at once on Retry now. Without it there is nothing to try: the page comes back when the browser is online again,
 * so it shows no countdown and no button. `standalone` is for the sign-in check on load, before there is a navbar.
 */
export function OfflinePage({
  onRetry,
  standalone = false,
}: Readonly<{ onRetry?: () => void; standalone?: boolean }>) {
  if (!onRetry) return <StatusPage {...OFFLINE} standalone={standalone} />;
  return <RetryingOfflinePage onRetry={onRetry} standalone={standalone} />;
}

function RetryingOfflinePage({
  onRetry,
  standalone,
}: Readonly<{ onRetry: () => void; standalone: boolean }>) {
  const [seconds, setSeconds] = useState(RETRY_SECONDS);
  // The latest onRetry, for the timer, which is set up once.
  const retry = useRef(onRetry);
  useEffect(() => {
    retry.current = onRetry;
  });
  // Each second counts down; at zero it tries again and starts over. `left` mirrors `seconds` for the timer.
  const left = useRef(RETRY_SECONDS);
  useEffect(() => {
    const timer = window.setInterval(() => {
      left.current -= 1;
      if (left.current <= 0) {
        left.current = RETRY_SECONDS;
        retry.current();
      }
      setSeconds(left.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function retryNow() {
    left.current = RETRY_SECONDS;
    setSeconds(RETRY_SECONDS);
    onRetry();
  }

  return (
    <StatusPage
      {...OFFLINE}
      note={<StatusNote dot>Trying again in {seconds}s</StatusNote>}
      standalone={standalone}
      actions={<PrimaryAction onClick={retryNow}>Retry now</PrimaryAction>}
    />
  );
}

/** 27d: the session ended while the User was away. Sign in brings them back to the page they were on. */
export function SessionExpiredPage() {
  const [params] = useSearchParams();
  return (
    <StatusPage
      eyebrow="Signed out"
      title="Your session expired."
      body="For your security we signed you out after a period of inactivity. Sign in to pick up where you left off."
      code="Session"
      name="expired"
      standalone
      actions={
        <PrimaryAction to={loginPath(safeReturnPath(params.get("returnTo")))}>
          Sign in
        </PrimaryAction>
      }
    />
  );
}

/** The status page for a page that failed to load; `onRetry` loads it again. */
export function FailedLoadPage({
  failure,
  onRetry,
}: Readonly<{ failure: FailedLoad; onRetry: () => void }>) {
  switch (failure) {
    case "not-found":
      return <NotFoundPage />;
    case "no-access":
      return <NoAccessPage />;
    case "offline":
      return <OfflinePage onRetry={onRetry} />;
    case "server":
      return <ServerErrorPage onRetry={onRetry} />;
  }
}
