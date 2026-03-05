import { clearMemoryCacheByPrefix, clearPersistentCache, withCache } from "./cache";
import { runKubectl, runKubectlJson } from "./kubectl";
import { isAllNamespaces } from "./namespace";
import { CronJob, Deployment, Job, K8sList, LabelSelector, Pod, Service } from "../types";

const TTL_CONTEXTS = 5 * 60_000;
const TTL_NAMESPACES = 60_000;
const TTL_RESOURCES = 10_000;

function cacheKey(...parts: string[]): string {
  return `kube:${parts.join(":")}`;
}

interface QueryOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

interface KubeConfigContext {
  name: string;
  context?: {
    namespace?: string;
  };
}

interface KubeConfigView {
  contexts?: KubeConfigContext[];
}

export async function listContexts(forceRefresh = false): Promise<string[]> {
  const key = cacheKey("contexts");
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
    await clearPersistentCache(key);
  }

  return withCache(
    key,
    TTL_CONTEXTS,
    async () => {
      const result = await runKubectl(["config", "get-contexts", "-o", "name"]);
      return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    },
    true,
  );
}

export async function getCurrentContext(forceRefresh = false): Promise<string> {
  const key = cacheKey("current-context");
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    20_000,
    async () => {
      const result = await runKubectl(["config", "current-context"]);
      return result.stdout.trim();
    },
    false,
  );
}

export async function setCurrentContext(context: string): Promise<void> {
  await runKubectl(["config", "use-context", context]);
  clearMemoryCacheByPrefix(cacheKey("current-context"));
}

export async function listNamespaces(
  context: string,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<string[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const key = cacheKey("namespaces", context);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
    await clearPersistentCache(key);
  }

  return withCache(
    key,
    TTL_NAMESPACES,
    async () => {
      const payload = await runKubectlJson<K8sList<{ metadata: { name: string } }>>(["get", "ns"], { context, signal });
      return payload.items.map((item) => item.metadata.name).sort((left, right) => left.localeCompare(right));
    },
    true,
  );
}

export async function getKubeconfigContextNamespace(
  context: string,
  forceRefresh = false,
): Promise<string | undefined> {
  const key = cacheKey("kubeconfig-context-namespace", context);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
    await clearPersistentCache(key);
  }

  return withCache(
    key,
    TTL_CONTEXTS,
    async () => {
      const payload = await runKubectlJson<KubeConfigView>(["config", "view", "-o", "json"]);
      const match = payload.contexts?.find((entry) => entry.name === context);
      const namespace = match?.context?.namespace?.trim();
      return namespace && namespace.length > 0 ? namespace : undefined;
    },
    true,
  );
}

export async function getPods(
  context: string,
  namespace: string,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<Pod[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const key = cacheKey("pods", context, namespace);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    TTL_RESOURCES,
    async () => {
      const namespaceScopeArgs = isAllNamespaces(namespace) ? ["-A"] : ["-n", namespace];
      const payload = await runKubectlJson<K8sList<Pod>>(["get", "pods", ...namespaceScopeArgs], { context, signal });
      return isAllNamespaces(namespace)
        ? payload.items
        : payload.items.filter((item) => item.metadata.namespace === namespace);
    },
    false,
  );
}

export async function getDeployments(
  context: string,
  namespace: string,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<Deployment[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const key = cacheKey("deployments", context, namespace);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    TTL_RESOURCES,
    async () => {
      const namespaceScopeArgs = isAllNamespaces(namespace) ? ["-A"] : ["-n", namespace];
      const payload = await runKubectlJson<K8sList<Deployment>>(["get", "deployments", ...namespaceScopeArgs], {
        context,
        signal,
      });
      return isAllNamespaces(namespace)
        ? payload.items
        : payload.items.filter((item) => item.metadata.namespace === namespace);
    },
    false,
  );
}

export async function getServices(
  context: string,
  namespace: string,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<Service[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const key = cacheKey("services", context, namespace);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    TTL_RESOURCES,
    async () => {
      const namespaceScopeArgs = isAllNamespaces(namespace) ? ["-A"] : ["-n", namespace];
      const payload = await runKubectlJson<K8sList<Service>>(["get", "services", ...namespaceScopeArgs], {
        context,
        signal,
      });
      return isAllNamespaces(namespace)
        ? payload.items
        : payload.items.filter((item) => item.metadata.namespace === namespace);
    },
    false,
  );
}

export async function getJobs(
  context: string,
  namespace: string,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<Job[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const key = cacheKey("jobs", context, namespace);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    TTL_RESOURCES,
    async () => {
      const namespaceScopeArgs = isAllNamespaces(namespace) ? ["-A"] : ["-n", namespace];
      const payload = await runKubectlJson<K8sList<Job>>(["get", "jobs", ...namespaceScopeArgs], { context, signal });
      return isAllNamespaces(namespace)
        ? payload.items
        : payload.items.filter((item) => item.metadata.namespace === namespace);
    },
    false,
  );
}

export async function getCronJobs(
  context: string,
  namespace: string,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<CronJob[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const key = cacheKey("cronjobs", context, namespace);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    TTL_RESOURCES,
    async () => {
      const namespaceScopeArgs = isAllNamespaces(namespace) ? ["-A"] : ["-n", namespace];
      const payload = await runKubectlJson<K8sList<CronJob>>(["get", "cronjobs", ...namespaceScopeArgs], {
        context,
        signal,
      });
      return isAllNamespaces(namespace)
        ? payload.items
        : payload.items.filter((item) => item.metadata.namespace === namespace);
    },
    false,
  );
}

export async function getPodsForDeployment(
  context: string,
  namespace: string,
  deployment: Deployment,
  forceRefreshOrOptions: boolean | QueryOptions = false,
): Promise<Pod[]> {
  const forceRefresh =
    typeof forceRefreshOrOptions === "boolean" ? forceRefreshOrOptions : Boolean(forceRefreshOrOptions.forceRefresh);
  const signal = typeof forceRefreshOrOptions === "boolean" ? undefined : forceRefreshOrOptions.signal;
  const selector = serializeLabelSelector(deployment.spec?.selector);
  if (!selector) {
    return [];
  }

  const key = cacheKey("pods-for-deployment", context, namespace, deployment.metadata.name, selector);
  if (forceRefresh) {
    clearMemoryCacheByPrefix(key);
  }

  return withCache(
    key,
    TTL_RESOURCES,
    async () => {
      const payload = await runKubectlJson<K8sList<Pod>>(["get", "pods", "-n", namespace, "-l", selector], {
        context,
        signal,
      });
      return payload.items.filter((item) => item.metadata.namespace === namespace);
    },
    false,
  );
}

export function clearResourceCache(context: string, namespace: string): void {
  clearMemoryCacheByPrefix(cacheKey("pods", context, namespace));
  clearMemoryCacheByPrefix(cacheKey("pods-for-deployment", context, namespace));
  clearMemoryCacheByPrefix(cacheKey("deployments", context, namespace));
  clearMemoryCacheByPrefix(cacheKey("services", context, namespace));
  clearMemoryCacheByPrefix(cacheKey("jobs", context, namespace));
  clearMemoryCacheByPrefix(cacheKey("cronjobs", context, namespace));
}

export async function getDeploymentEvents(context: string, namespace: string, deployment: string): Promise<string> {
  const result = await runKubectl(
    [
      "get",
      "events",
      "--field-selector",
      `involvedObject.kind=Deployment,involvedObject.name=${deployment}`,
      "--sort-by=.lastTimestamp",
    ],
    { context, namespace },
  );

  return result.stdout.trim();
}

function serializeLabelSelector(selector: LabelSelector | undefined): string {
  if (!selector) {
    return "";
  }

  const clauses: string[] = [];
  const labels = selector.matchLabels ?? {};
  for (const [key, value] of Object.entries(labels)) {
    clauses.push(`${key}=${value}`);
  }

  for (const expression of selector.matchExpressions ?? []) {
    const values = expression.values ?? [];
    switch (expression.operator) {
      case "In":
        if (values.length > 0) {
          clauses.push(`${expression.key} in (${values.join(",")})`);
        }
        break;
      case "NotIn":
        if (values.length > 0) {
          clauses.push(`${expression.key} notin (${values.join(",")})`);
        }
        break;
      case "Exists":
        clauses.push(expression.key);
        break;
      case "DoesNotExist":
        clauses.push(`!${expression.key}`);
        break;
      default:
        break;
    }
  }

  return clauses.join(",");
}
