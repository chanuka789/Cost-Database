/**
 * Project names as written on BOQ covers rarely match exactly: "Q WALK",
 * "Q-Walk" and "Q Walk" are the same project. Comparing on letters and
 * digits only stops the same project being created twice.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findSimilarProject<T extends { name: string }>(name: string, projects: T[]): T | undefined {
  const key = nameKey(name);
  if (key.length < 2) return undefined;
  return projects.find((p) => nameKey(p.name) === key);
}
