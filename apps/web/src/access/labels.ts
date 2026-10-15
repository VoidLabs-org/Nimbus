import type { Kind, Scope } from "../api/client";

export const kindLabels: Record<Kind, string> = {
  platform: "Platform role",
  project: "Project role",
};

export const scopeLabels: Record<Scope, string> = {
  own: "Own",
  project: "Project",
  all: "All",
};
