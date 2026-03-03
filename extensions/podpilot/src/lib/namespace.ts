export const ALL_NAMESPACES = "__all_namespaces__";
export const ALL_NAMESPACES_LABEL = "All namespaces";

export function isAllNamespaces(namespace: string): boolean {
  return namespace === ALL_NAMESPACES;
}

export function formatNamespaceLabel(namespace?: string): string {
  if (!namespace) {
    return "No namespace";
  }

  return isAllNamespaces(namespace) ? ALL_NAMESPACES_LABEL : namespace;
}

export function resolveItemNamespace(selectedNamespace: string, itemNamespace?: string): string {
  if (isAllNamespaces(selectedNamespace)) {
    return itemNamespace ?? "default";
  }

  return selectedNamespace;
}
