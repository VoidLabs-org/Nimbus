import { act } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { AppState } from "react-native";

/** What the app keeps in the phone's secure storage (see jest.setup.ts), to seed and inspect. */
export const secureStore = (globalThis as unknown as { __secureStore: Map<string, string> })
  .__secureStore;

/** One request the app sent, as the fake API saw it. */
export type SentRequest = { method: string; path: string; headers: Headers; body: unknown };

type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | "offline";

type Handler = (request: SentRequest) => Answer | Promise<Answer>;

/**
 * Stands in for the Nimbus API: `answer` sets what a path answers (in order, the last one repeating), and `sent` lists
 * every request the app made. Unknown paths answer 404, so a test sees a request it didn't expect.
 */
export function fakeApi() {
  const handlers = new Map<string, Handler[]>();
  const sent: SentRequest[] = [];

  globalThis.fetch = jest.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const request: SentRequest = {
      method: init.method ?? "GET",
      path: url.pathname,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    sent.push(request);
    const queue = handlers.get(`${request.method} ${request.path}`);
    const handler = queue && (queue.length > 1 ? queue.shift()! : queue[0]!);
    const answer = handler ? await handler(request) : { status: 404 };
    if (answer === "offline") throw new TypeError("Network request failed");
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json", ...answer.headers },
    });
  }) as typeof fetch;

  return {
    sent,
    /** Answers `METHOD /path` with each of `answers` in turn, the last one for every later request. */
    answer(route: string, ...answers: (Answer | Handler)[]) {
      handlers.set(
        route,
        answers.map((answer) => (typeof answer === "function" ? answer : () => answer)),
      );
    },
    /** The requests sent to `METHOD /path`. */
    to(route: string) {
      return sent.filter((request) => `${request.method} ${request.path}` === route);
    },
  };
}

export const ada = {
  id: "7a3c6c1e-0000-4000-8000-000000000001",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  hasPassword: true,
  emailVerified: true,
  passwordChangedAt: null,
  hasUploadedPicture: false,
  pictureSource: "initials",
  pictureOptions: { uploadedAt: null, uploadedUrl: null, providers: [] },
};

/** Opens the real app, as on a phone. */
export function renderApp(initialUrl?: string) {
  return renderRouter("./src/app", initialUrl ? { initialUrl } : undefined);
}

/** An answer the test releases when it chooses, to hold a request "in flight". */
export function heldBack() {
  let release!: (answer: Answer) => void;
  const answer = new Promise<Answer>((resolve) => {
    release = resolve;
  });
  return { answer: () => answer, release: (value: Answer) => act(async () => release(value)) };
}

/**
 * The User leaves the app and comes back `minutes` later: the clock moves on, and the app hears it went to the
 * background and returned, as React Native's AppState (mocked in tests) would tell it.
 */
export async function comeBackToTheApp(minutes: number) {
  const now = Date.now() + minutes * 60_000;
  jest.spyOn(Date, "now").mockReturnValue(now);
  const listeners = (AppState.addEventListener as jest.Mock).mock.calls
    .filter(([event]) => event === "change")
    .map(([, listener]) => listener as (status: string) => void);
  await act(async () => {
    for (const listener of listeners) listener("background");
    for (const listener of listeners) listener("active");
  });
}
