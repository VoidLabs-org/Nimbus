import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { DestinationLink, RailLink } from "./AppShell";
import { DESTINATIONS } from "./navigation";

/** The links as the navbar draws them at an address: which of them say they are the current page. */
function currentAt(path: string, link: "bar" | "rail"): string[] {
  const html = renderToStaticMarkup(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        {DESTINATIONS.map((destination) =>
          link === "bar" ? (
            <DestinationLink key={destination.id} destination={destination} />
          ) : (
            <RailLink key={destination.id} destination={destination} side="left" />
          ),
        )}
      </MemoryRouter>
    </MantineProvider>,
  );
  return [...html.matchAll(/<a [^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes('aria-current="page"'))
    .map((tag) => (tag.includes('data-nav-focus="home"') ? "home" : "settings"));
}

describe.each(["bar", "rail"] as const)("the %s links", (link) => {
  it("mark only Home as current on the home page", () => {
    expect(currentAt("/", link)).toEqual(["home"]);
  });

  it("mark only Settings as current on a page under /settings", () => {
    expect(currentAt("/settings", link)).toEqual(["settings"]);
    expect(currentAt("/settings/profile", link)).toEqual(["settings"]);
    expect(currentAt("/settings/roles/admin", link)).toEqual(["settings"]);
  });
});
