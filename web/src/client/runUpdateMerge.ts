export interface VersionedEntity {
  id: string;
  version: number;
}

export interface RunUpdateEntity extends VersionedEntity {
  postCompletionUpdatedAt?: string | null;
  postCompletionUpdatedBy?: string | null;
}

export function mergeVersionedEntity<T extends VersionedEntity>(current: T, incoming: T): T {
  if (incoming.id !== current.id || incoming.version < current.version) return current;
  return { ...current, ...incoming };
}

export function mergeRunUpdateEntity<T extends RunUpdateEntity>(current: T, incoming: RunUpdateEntity): T {
  if (incoming.id !== current.id || incoming.version < current.version) return current;
  return {
    ...current,
    ...incoming,
    postCompletionUpdatedAt: incoming.postCompletionUpdatedAt ?? current.postCompletionUpdatedAt,
    postCompletionUpdatedBy: incoming.postCompletionUpdatedBy ?? current.postCompletionUpdatedBy,
  };
}
