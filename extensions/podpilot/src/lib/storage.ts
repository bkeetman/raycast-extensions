import { LocalStorage } from "@raycast/api";

const FAVORITE_CONTEXTS_KEY = "favorites:contexts";
const FAVORITE_NAMESPACES_KEY = "favorites:namespaces";
const DEFAULT_NAMESPACES_KEY = "defaults:namespaces";
const LAST_SELECTED_NAMESPACES_KEY = "selected:namespaces";

type NamespaceFavorites = Record<string, string[]>;
type DefaultNamespaces = Record<string, string>;
type SelectedNamespaces = Record<string, string>;

async function getJsonValue<T>(key: string, fallback: T): Promise<T> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    await LocalStorage.removeItem(key);
    return fallback;
  }
}

async function setJsonValue<T>(key: string, value: T): Promise<void> {
  await LocalStorage.setItem(key, JSON.stringify(value));
}

export async function getFavoriteContexts(): Promise<string[]> {
  return getJsonValue<string[]>(FAVORITE_CONTEXTS_KEY, []);
}

export async function toggleFavoriteContext(context: string): Promise<string[]> {
  const current = await getFavoriteContexts();
  const next = current.includes(context) ? current.filter((entry) => entry !== context) : [...current, context];
  await setJsonValue(FAVORITE_CONTEXTS_KEY, next);
  return next;
}

export async function getFavoriteNamespaces(context: string): Promise<string[]> {
  const map = await getJsonValue<NamespaceFavorites>(FAVORITE_NAMESPACES_KEY, {});
  return map[context] ?? [];
}

export async function toggleFavoriteNamespace(context: string, namespace: string): Promise<string[]> {
  const map = await getJsonValue<NamespaceFavorites>(FAVORITE_NAMESPACES_KEY, {});
  const current = map[context] ?? [];
  const next = current.includes(namespace) ? current.filter((entry) => entry !== namespace) : [...current, namespace];
  map[context] = next;
  await setJsonValue(FAVORITE_NAMESPACES_KEY, map);
  return next;
}

export async function getDefaultNamespace(context: string): Promise<string | undefined> {
  const map = await getJsonValue<DefaultNamespaces>(DEFAULT_NAMESPACES_KEY, {});
  return map[context];
}

export async function setDefaultNamespace(context: string, namespace: string): Promise<void> {
  const map = await getJsonValue<DefaultNamespaces>(DEFAULT_NAMESPACES_KEY, {});
  map[context] = namespace;
  await setJsonValue(DEFAULT_NAMESPACES_KEY, map);
}

export async function getLastSelectedNamespace(context: string): Promise<string | undefined> {
  const map = await getJsonValue<SelectedNamespaces>(LAST_SELECTED_NAMESPACES_KEY, {});
  return map[context];
}

export async function setLastSelectedNamespace(context: string, namespace: string): Promise<void> {
  const map = await getJsonValue<SelectedNamespaces>(LAST_SELECTED_NAMESPACES_KEY, {});
  map[context] = namespace;
  await setJsonValue(LAST_SELECTED_NAMESPACES_KEY, map);
}

export function sortWithFavorites(items: string[], favorites: string[]): string[] {
  return [...items].sort((left, right) => {
    const leftFav = favorites.includes(left) ? 0 : 1;
    const rightFav = favorites.includes(right) ? 0 : 1;

    if (leftFav !== rightFav) {
      return leftFav - rightFav;
    }

    return left.localeCompare(right);
  });
}
