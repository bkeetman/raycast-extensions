import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { ALL_NAMESPACES, formatNamespaceLabel, isAllNamespaces } from "../lib/namespace";

interface SelectContextListProps {
  contexts: string[];
  selectedContext: string;
  favoriteContexts: string[];
  onSelect: (context: string) => void;
  onToggleFavorite?: (context: string) => Promise<void>;
}

export function SelectContextList({
  contexts,
  selectedContext,
  favoriteContexts,
  onSelect,
  onToggleFavorite,
}: SelectContextListProps) {
  const { pop } = useNavigation();

  return (
    <List navigationTitle="Select Context">
      {contexts.map((context) => {
        const favorite = favoriteContexts.includes(context);

        return (
          <List.Item
            key={context}
            title={context}
            icon={favorite ? Icon.Star : undefined}
            accessories={selectedContext === context ? [{ text: "Current" }] : []}
            actions={
              <ActionPanel>
                <Action
                  title="Use Context"
                  onAction={() => {
                    onSelect(context);
                    pop();
                  }}
                />
                {onToggleFavorite ? (
                  <Action
                    title={favorite ? "Remove Favorite" : "Add Favorite"}
                    icon={favorite ? Icon.StarDisabled : Icon.Star}
                    onAction={async () => {
                      await onToggleFavorite(context);
                    }}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

interface SelectNamespaceListProps {
  namespaces: string[];
  selectedNamespace: string;
  favoriteNamespaces: string[];
  onSelect: (namespace: string) => void;
  onToggleFavorite?: (namespace: string) => Promise<void>;
  includeAllOption?: boolean;
}

export function SelectNamespaceList({
  namespaces,
  selectedNamespace,
  favoriteNamespaces,
  onSelect,
  onToggleFavorite,
  includeAllOption = false,
}: SelectNamespaceListProps) {
  const { pop } = useNavigation();
  const items = includeAllOption ? [ALL_NAMESPACES, ...namespaces] : namespaces;

  return (
    <List navigationTitle="Select Namespace">
      {items.map((namespace) => {
        const isAll = isAllNamespaces(namespace);
        const favorite = favoriteNamespaces.includes(namespace);

        return (
          <List.Item
            key={namespace}
            title={formatNamespaceLabel(namespace)}
            icon={isAll ? Icon.List : favorite ? Icon.Star : undefined}
            accessories={selectedNamespace === namespace ? [{ text: "Selected" }] : []}
            actions={
              <ActionPanel>
                <Action
                  title="Use Namespace"
                  onAction={() => {
                    onSelect(namespace);
                    pop();
                  }}
                />
                {onToggleFavorite && !isAll ? (
                  <Action
                    title={favorite ? "Remove Favorite" : "Add Favorite"}
                    icon={favorite ? Icon.StarDisabled : Icon.Star}
                    onAction={async () => {
                      await onToggleFavorite(namespace);
                    }}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
