import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentContext, getKubeconfigContextNamespace, listContexts, listNamespaces } from "./kube-data";
import { isAllNamespaces } from "./namespace";
import {
  getDefaultNamespace,
  getFavoriteContexts,
  getFavoriteNamespaces,
  getLastSelectedNamespace,
  setDefaultNamespace,
  setLastSelectedNamespace,
  sortWithFavorites,
  toggleFavoriteContext,
  toggleFavoriteNamespace,
} from "./storage";

export interface ContextNamespaceState {
  contexts: string[];
  namespaces: string[];
  favoriteContexts: string[];
  favoriteNamespaces: string[];
  selectedContext: string;
  selectedNamespace: string;
  setSelectedContext: (context: string) => void;
  setSelectedNamespace: (namespace: string) => void;
  toggleContextFavorite: (context: string) => Promise<void>;
  toggleNamespaceFavorite: (namespace: string) => Promise<void>;
  saveDefaultNamespace: (namespace: string) => Promise<void>;
  refresh: () => Promise<void>;
  isLoadingContexts: boolean;
  isLoadingNamespaces: boolean;
  error?: unknown;
}

export function useContextNamespace(): ContextNamespaceState {
  const [contexts, setContexts] = useState<string[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [favoriteContexts, setFavoriteContexts] = useState<string[]>([]);
  const [favoriteNamespaces, setFavoriteNamespaces] = useState<string[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>("");
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [isLoadingContexts, setIsLoadingContexts] = useState<boolean>(true);
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState<boolean>(false);
  const [error, setError] = useState<unknown>();
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const forceRefreshRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    forceRefreshRef.current = true;
    setRefreshToken((value) => value + 1);
  }, []);

  const selectContext = useCallback((context: string) => {
    setSelectedContext(context);
    setNamespaces([]);
    setFavoriteNamespaces([]);
    setSelectedNamespace("");
    setIsLoadingNamespaces(true);
  }, []);

  const selectNamespace = useCallback((namespace: string) => {
    setSelectedNamespace(namespace);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadContexts() {
      setIsLoadingContexts(true);
      setError(undefined);
      const forceRefresh = forceRefreshRef.current;

      try {
        const [allContexts, currentContext, favorites] = await Promise.all([
          listContexts(forceRefresh),
          getCurrentContext(forceRefresh),
          getFavoriteContexts(),
        ]);

        if (cancelled) {
          return;
        }

        const sorted = sortWithFavorites(allContexts, favorites);
        setFavoriteContexts(favorites);
        setContexts(sorted);

        setSelectedContext((current) => {
          if (current && sorted.includes(current)) {
            return current;
          }

          if (currentContext && sorted.includes(currentContext)) {
            return currentContext;
          }

          return sorted[0] ?? "";
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingContexts(false);
        }
      }
    }

    loadContexts();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (!selectedContext) {
      setIsLoadingNamespaces(false);
      return;
    }

    let cancelled = false;

    async function loadNamespacesForContext() {
      setIsLoadingNamespaces(true);
      setError(undefined);
      const forceRefresh = forceRefreshRef.current;

      try {
        const [allNamespaces, favorites, lastSelectedNamespace, kubeconfigNamespace, defaultNamespace] = await Promise.all([
          listNamespaces(selectedContext, { forceRefresh }),
          getFavoriteNamespaces(selectedContext),
          getLastSelectedNamespace(selectedContext),
          getKubeconfigContextNamespace(selectedContext, forceRefresh),
          getDefaultNamespace(selectedContext),
        ]);

        if (cancelled) {
          return;
        }

        const sorted = sortWithFavorites(allNamespaces, favorites);
        setFavoriteNamespaces(favorites);
        setNamespaces(sorted);

        setSelectedNamespace((current) => {
          if (isAllNamespaces(current)) {
            return current;
          }

          if (current && sorted.includes(current)) {
            return current;
          }

          if (lastSelectedNamespace && isAllNamespaces(lastSelectedNamespace)) {
            return lastSelectedNamespace;
          }

          if (lastSelectedNamespace && sorted.includes(lastSelectedNamespace)) {
            return lastSelectedNamespace;
          }

          if (defaultNamespace && sorted.includes(defaultNamespace)) {
            return defaultNamespace;
          }

          if (kubeconfigNamespace && sorted.includes(kubeconfigNamespace)) {
            return kubeconfigNamespace;
          }

          if (sorted.includes("default")) {
            return "default";
          }

          return sorted[0] ?? "";
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingNamespaces(false);
          forceRefreshRef.current = false;
        }
      }
    }

    loadNamespacesForContext();

    return () => {
      cancelled = true;
    };
  }, [selectedContext, refreshToken]);

  useEffect(() => {
    if (!selectedContext || !selectedNamespace) {
      return;
    }

    void setLastSelectedNamespace(selectedContext, selectedNamespace);
  }, [selectedContext, selectedNamespace]);

  const toggleContextFavorite = useCallback(
    async (context: string) => {
      const favorites = await toggleFavoriteContext(context);
      setFavoriteContexts(favorites);
      setContexts((current) => sortWithFavorites(current, favorites));
    },
    [setFavoriteContexts],
  );

  const toggleNamespaceFavorite = useCallback(
    async (namespace: string) => {
      if (!selectedContext) {
        return;
      }

      const favorites = await toggleFavoriteNamespace(selectedContext, namespace);
      setFavoriteNamespaces(favorites);
      setNamespaces((current) => sortWithFavorites(current, favorites));
    },
    [selectedContext],
  );

  const saveDefaultNamespace = useCallback(
    async (namespace: string) => {
      if (!selectedContext) {
        return;
      }

      await setDefaultNamespace(selectedContext, namespace);
    },
    [selectedContext],
  );

  return useMemo(
    () => ({
      contexts,
      namespaces,
      favoriteContexts,
      favoriteNamespaces,
      selectedContext,
      selectedNamespace,
      setSelectedContext: selectContext,
      setSelectedNamespace: selectNamespace,
      toggleContextFavorite,
      toggleNamespaceFavorite,
      saveDefaultNamespace,
      refresh,
      isLoadingContexts,
      isLoadingNamespaces,
      error,
    }),
    [
      contexts,
      namespaces,
      favoriteContexts,
      favoriteNamespaces,
      selectedContext,
      selectedNamespace,
      selectContext,
      selectNamespace,
      toggleContextFavorite,
      toggleNamespaceFavorite,
      saveDefaultNamespace,
      refresh,
      isLoadingContexts,
      isLoadingNamespaces,
      error,
    ],
  );
}
