type Entry = { action: string; details: unknown };

function detail(details: unknown, key: string): string | undefined {
  if (details && typeof details === "object" && key in details) {
    const v = (details as Record<string, unknown>)[key];
    return v == null ? undefined : String(v);
  }
  return undefined;
}

const ROLE = (r?: string) => (r === "ADMIN" ? "admin" : "user");

/** Plain-English sentence for an activity log entry. */
export function describeAction(e: Entry, targetName?: string): string {
  const who = targetName ?? detail(e.details, "email") ?? "a user";
  const name = detail(e.details, "name");
  const from = detail(e.details, "from");
  const to = detail(e.details, "to");
  switch (e.action) {
    case "auth.signed_in":
      return "Signed in";
    case "auth.locked":
      return "Account locked after too many wrong passwords";
    case "auth.invite_accepted":
      return "Accepted invite and set a password";
    case "auth.password_reset":
      return "Reset password with a reset link";
    case "auth.password_changed":
      return "Changed password";
    case "auth.reset_requested":
      return "Asked for a password reset link";
    case "user.seeded_admin":
      return "First admin account created";
    case "user.invited":
      return `Invited ${who} as ${ROLE(detail(e.details, "role"))}`;
    case "user.invite_resent":
      return `Created a new invite link for ${who}`;
    case "user.reset_link_created":
      return `Created a password reset link for ${who}`;
    case "user.role_changed":
      return `Changed ${who} from ${ROLE(from)} to ${ROLE(to)}`;
    case "user.disabled":
      return `Disabled ${who}`;
    case "user.enabled":
      return `Enabled ${who}`;
    case "user.renamed":
      return `Renamed ${who}`;
    case "user.renamed_self":
      return "Changed own name";
    case "project.created":
      return `Created project ${name ?? ""}`.trim();
    case "document.uploaded":
      return `Uploaded BOQ ${detail(e.details, "title") ?? ""}`.trim();
    case "document.extracted": {
      const items = detail(e.details, "items");
      const errors = Number(detail(e.details, "errors") ?? 0);
      const warnings = Number(detail(e.details, "warnings") ?? 0);
      return `Extraction finished: ${items ?? "?"} items, ${errors} errors, ${warnings} warnings`;
    }
    case "document.failed":
      return `Extraction failed (${detail(e.details, "code") ?? "unknown"})`;
    case "document.retried":
      return "Started the extraction again";
    case "document.deleted":
      return `Deleted BOQ ${detail(e.details, "title") ?? ""}`.trim();
  }
  const [entity, verb] = e.action.split(".");
  const noun = { country: "country", city: "city", buildingType: "building type", stage: "stage" }[entity] ?? entity;
  const label = name ?? to ?? "";
  switch (verb) {
    case "created":
      return `Added ${noun} ${label}`.trim();
    case "renamed":
      return from && to ? `Renamed ${noun} ${from} to ${to}` : `Renamed ${noun}`;
    case "updated":
      return `Updated ${noun} ${label}`.trim();
    case "activated":
      return `Showed ${noun} ${label} again`.replace("  ", " ");
    case "deactivated":
      return `Hid ${noun} ${label}`.trim();
    case "reordered":
      return `Moved ${noun} ${label} ${detail(e.details, "direction") ?? ""}`.trim();
  }
  return e.action;
}
