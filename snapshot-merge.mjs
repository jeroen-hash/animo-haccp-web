const MISSING = Symbol("missing");

function sameValue(a, b) {
  if (a === MISSING || b === MISSING) return a === b;
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false;
  return aKeys.every(key => sameValue(a[key], b[key]));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeArray(base, local, remote, path, conflicts) {
  const keyed = [base, local, remote].every(list =>
    list.every(item => isRecord(item) && (typeof item.id === "string" || typeof item.id === "number"))
  );
  if (!keyed) {
    if (sameValue(local, base)) return remote;
    if (sameValue(remote, base) || sameValue(local, remote)) return local;
    conflicts.push(path || "(root)");
    return remote;
  }

  const idOf = item => String(item.id);
  const hasDuplicateIds = list => new Set(list.map(idOf)).size !== list.length;
  if ([base, local, remote].some(hasDuplicateIds)) {
    conflicts.push(path || "(root)");
    return remote;
  }
  const baseMap = new Map(base.map(item => [idOf(item), item]));
  const localMap = new Map(local.map(item => [idOf(item), item]));
  const remoteMap = new Map(remote.map(item => [idOf(item), item]));
  const ids = [...new Set([...remote.map(idOf), ...local.map(idOf), ...base.map(idOf)])];
  const merged = [];

  for (const id of ids) {
    const item = mergeValue(
      baseMap.has(id) ? baseMap.get(id) : MISSING,
      localMap.has(id) ? localMap.get(id) : MISSING,
      remoteMap.has(id) ? remoteMap.get(id) : MISSING,
      path + "[" + id + "]",
      conflicts
    );
    if (item !== MISSING) merged.push(item);
  }
  return merged;
}

function mergeValue(base, local, remote, path, conflicts) {
  if (sameValue(local, base)) return remote;
  if (sameValue(remote, base) || sameValue(local, remote)) return local;

  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const value = mergeValue(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(local, key) ? local[key] : MISSING,
        Object.hasOwn(remote, key) ? remote[key] : MISSING,
        path ? path + "." + key : key,
        conflicts
      );
      if (value !== MISSING) result[key] = value;
    }
    return result;
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeArray(base, local, remote, path, conflicts);
  }

  conflicts.push(path || "(root)");
  return remote;
}

/**
 * Conservative three-way merge. Independent fields and records are combined.
 * Conflicting edits to the same field are reported and the remote value is
 * retained only as a preview; callers MUST NOT save when conflicts exist.
 */
export function mergeSnapshots(base, local, remote) {
  if (!isRecord(base) || !isRecord(local) || !isRecord(remote)) {
    return { ok: false, data: remote, conflicts: ["(root)"] };
  }
  const conflicts = [];
  const data = mergeValue(base, local, remote, "", conflicts);
  return { ok: conflicts.length === 0, data, conflicts: [...new Set(conflicts)] };
}
