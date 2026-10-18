import { useEffect, useState } from "react";

/** How long Resend stays off after a send, matching the server's 60 seconds between emails to one address. */
export const RESEND_WAIT_SECONDS = 60;

/** Counts {@code seconds} down to 0, one a second, once it is set above 0. */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds] as const;
}

/** 42 seconds as "0:42", 60 as "1:00". */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
