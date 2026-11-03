// Stored board scans (D34): one JPEG per track in IndexedDB, with its date.
// Every call fails soft: without storage the app falls back to the printed board.
const DB = "heat-legends";
const STORE = "scans";

export type StoredScan = { trackId: string; date: number; image: Blob };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "trackId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function loadScan(trackId: string): Promise<StoredScan | null> {
  try {
    return (await run<StoredScan | undefined>("readonly", (s) => s.get(trackId))) ?? null;
  } catch {
    return null;
  }
}

export async function saveScan(scan: StoredScan): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(scan));
    return true;
  } catch {
    return false;
  }
}
