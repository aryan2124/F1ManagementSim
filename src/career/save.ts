import type { CareerState } from "./types";
import { upgradeState } from "./migrate";

/**
 * Saves live in the browser (IndexedDB). A career is plain JSON, so export and import are just text.
 * When IndexedDB is missing (tests, private windows) an in-memory map stands in so nothing throws.
 */

const DB = "boxbox";
const STORE = "careers";
const mem = new Map<string, string>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      if (typeof indexedDB === "undefined") return res(null);
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

export async function saveCareer(slot: string, s: CareerState): Promise<void> {
  const text = JSON.stringify(s);
  mem.set(slot, text);
  const db = await open();
  if (!db) return;
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(text, slot);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch {
      res();
    }
  });
  db.close();
}

export async function loadCareer(slot: string): Promise<CareerState | null> {
  const db = await open();
  let text: string | undefined;
  if (db) {
    text = await new Promise<string | undefined>((res) => {
      try {
        const rq = db.transaction(STORE, "readonly").objectStore(STORE).get(slot);
        rq.onsuccess = () => res(rq.result as string | undefined);
        rq.onerror = () => res(undefined);
      } catch {
        res(undefined);
      }
    });
    db.close();
  }
  text = text ?? mem.get(slot);
  return text ? parseCareer(text) : null;
}

export async function deleteCareer(slot: string): Promise<void> {
  mem.delete(slot);
  const db = await open();
  if (!db) return;
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(slot);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch {
      res();
    }
  });
  db.close();
}

export function exportCareer(s: CareerState): string {
  return JSON.stringify(s);
}

/** Returns null for anything that is not a career of the current version. */
export function parseCareer(text: string): CareerState | null {
  try {
    const s = JSON.parse(text) as CareerState;
    if (s && s.v === 1 && s.teams && s.drivers && Array.isArray(s.calendar)) return upgradeState(s);
  } catch {
    /* fall through */
  }
  return null;
}
