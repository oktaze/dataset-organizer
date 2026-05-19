/** Hugging Face token storage.
 *
 * Backed by `tauri-plugin-store` (a JSON file in the app data dir — same
 * security posture as the localStorage-persisted settings). Everything else
 * depends only on the `getToken`/`setToken` pair, so the backing store can
 * later be swapped for an OS keychain without touching the UI or the hook.
 */

import { load, type Store } from "@tauri-apps/plugin-store";

const FILE = "hf.json";
const KEY = "token";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(FILE, { defaults: {}, autoSave: true });
  return storePromise;
}

export async function getToken(): Promise<string | null> {
  const store = await getStore();
  const t = await store.get<string>(KEY);
  return t && t.trim() ? t : null;
}

export async function setToken(token: string | null): Promise<void> {
  const store = await getStore();
  if (token && token.trim()) {
    await store.set(KEY, token.trim());
  } else {
    await store.delete(KEY);
  }
  await store.save();
}
