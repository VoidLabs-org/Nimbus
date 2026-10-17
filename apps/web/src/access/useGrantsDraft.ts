import { useState } from "react";
import { ApiError, api, type CatalogPermission, type Role, type Scope } from "../api/client";
import { changeCount, grantsSignature, scopesIn } from "./grants";

/**
 * A Role's unsaved Grants. They live above the tabs and the summary so Save and Discard can sit in the summary and
 * ticks survive a visit to the People tab. Nothing is saved until `save`, which replaces all Grants at once and is
 * refused if someone changed the Role meanwhile. The draft starts again when the stored Grants change (saved or
 * reset), unless it has unsaved ticks that a refresh would lose; renaming keeps it. Changes are ignored while a save runs, so none are lost when it returns.
 */
export function useGrantsDraft(role: Role, onSaved: (role: Role) => void) {
  const saved = new Map(role.grants.map((grant) => [grant.permission, grant.scope]));
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The stored Grants changed under the draft (saved, reset, or changed by someone else, which a refresh shows): start
  // from them, unless there are unsaved ticks, which a refresh must not throw away. Saving them is then refused if the
  // Role changed meanwhile, and the page says so. Resetting starts the page again (see RolePage).
  const signature = grantsSignature(role);
  const [seen, setSeen] = useState({ signature, saved });
  if (seen.signature !== signature) {
    const untouched = changeCount(seen.saved, draft) === 0;
    setSeen({ signature, saved });
    if (untouched) {
      setDraft(saved);
      setErrors({});
      setFailure(null);
    }
  }

  function toggle(permission: CatalogPermission, checked: boolean) {
    if (saving) return;
    const next = new Map(draft);
    if (checked) {
      const scopes = scopesIn(role, permission);
      next.set(permission.key, scopes.includes("project") ? "project" : (scopes[0] ?? null));
    } else {
      next.delete(permission.key);
    }
    setDraft(next);
  }

  function changeScope(permission: string, scope: Scope) {
    if (saving) return;
    setDraft(new Map(draft).set(permission, scope));
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setFailure(null);
    try {
      onSaved(
        await api.saveGrants(role.key, {
          grants: [...draft].map(([permission, scope]) => ({ permission, scope })),
          version: role.version,
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setErrors(error.fieldErrors);
        setFailure("Some Permissions can't be held like this. See the messages below.");
      } else if (error instanceof ApiError && error.status === 409) {
        setFailure(error.message);
      } else {
        setFailure("Couldn't save the Permissions. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    errors,
    failure,
    saving,
    changes: changeCount(saved, draft),
    toggle,
    changeScope,
    discard: () => {
      setDraft(saved);
      setErrors({});
      setFailure(null);
    },
    save,
  };
}

export type GrantsDraft = ReturnType<typeof useGrantsDraft>;
