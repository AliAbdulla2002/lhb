import { useSyncExternalStore } from "react";

/**
 * Cart persisted in localStorage. Prices stored here are display estimates only; the
 * server (quote_cart / place_order) recalculates everything from the database.
 */
export interface CartLine {
  key: string;
  productId: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  optionValueIds: string[];
  optionLabels: { ar: string; en: string }[];
  notes: string;
  unitEstimate: number;
}

const STORAGE_KEY = "lahab.cart.v1";
export const MAX_QUANTITY = 20;
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    lines = Array.isArray(parsed) ? (parsed as CartLine[]).filter((l) => l && typeof l.productId === "string") : [];
  } catch {
    lines = [];
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: cart still works for this page session.
  }
  listeners.forEach((l) => l());
}

export function lineKey(productId: string, optionValueIds: string[], notes: string) {
  return [productId, [...optionValueIds].sort().join(","), notes.trim()].join("|");
}

export const cart = {
  add(line: Omit<CartLine, "key">) {
    load();
    const key = lineKey(line.productId, line.optionValueIds, line.notes);
    const existing = lines.find((l) => l.key === key);
    if (existing) {
      commit(lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + line.quantity) } : l)));
    } else {
      commit([...lines, { ...line, key, quantity: Math.min(MAX_QUANTITY, line.quantity) }]);
    }
  },
  setQuantity(key: string, quantity: number) {
    load();
    if (quantity <= 0) return cart.remove(key);
    commit(lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l)));
  },
  remove(key: string) {
    load();
    commit(lines.filter((l) => l.key !== key));
  },
  clear() {
    commit([]);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      loaded = false;
      load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return lines;
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function useCartCount(): number {
  return useCart().reduce((n, l) => n + l.quantity, 0);
}

/** Test helper. */
export function __resetCartForTests() {
  lines = EMPTY;
  loaded = false;
}
