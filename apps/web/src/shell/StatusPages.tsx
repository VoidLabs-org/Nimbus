import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { FailedLoad } from "../api/failure";
import { loginPath, safeReturnPath } from "../auth/returnPath";
import { PrimaryAction, SecondaryAction, StatusNote, StatusPage } from "./StatusPage";

/** Go back where the User came from. */
function GoBack() {
  const navigate = useNavigate();
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
 * 27c: the server failed, or the page crashed. Try again calls `onRetry`, which loads the page again. Without the
 * navbar (`standalone`) there is no home to go to, so only Try again shows.
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

/** Seconds between automatic tries while offline. */
const RETRY_SECONDS = 8;

/**
 * 27e: no connection. Tries again every few seconds by itself (`onRetry`), counting down, and at once on Retry now.
 * `standalone` is for the sign-in check on load, before there is a navbar.
 */
export function OfflinePage({
  onRetry,
  standalone = false,
}: Readonly<{ onRetry: () => void; standalone?: boolean }>) {
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
      eyebrow="No connection"
      title="You’re offline."
      body="Check your internet connection. Nimbus will reconnect automatically."
      note={<StatusNote dot>Trying again in {seconds}s</StatusNote>}
      code="Offline"
      name="reconnecting"
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
