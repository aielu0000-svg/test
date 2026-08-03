export interface ExplorerFolderLike {
  id: string;
  parentId: string | null;
  name: string;
}

export function folderAncestors<T extends ExplorerFolderLike>(folders: T[], folderId: string | null | undefined): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: T[] = [];
  const visited = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function folderDescendantIds<T extends ExplorerFolderLike>(folders: T[], folderId: string): Set<string> {
  const children = new Map<string | null, T[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    children.set(key, [...(children.get(key) ?? []), folder]);
  }
  const descendants = new Set<string>();
  const stack = [...(children.get(folderId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (descendants.has(current.id)) continue;
    descendants.add(current.id);
    stack.push(...(children.get(current.id) ?? []));
  }
  return descendants;
}

export function invalidMoveTargetIds<T extends ExplorerFolderLike>(folders: T[], movingFolderIds: string[]): Set<string> {
  const invalid = new Set<string>();
  for (const id of movingFolderIds) {
    invalid.add(id);
    for (const descendant of folderDescendantIds(folders, id)) invalid.add(descendant);
  }
  return invalid;
}

export function folderDepth<T extends ExplorerFolderLike>(folders: T[], folderId: string): number {
  return Math.max(0, folderAncestors(folders, folderId).length - 1);
}
