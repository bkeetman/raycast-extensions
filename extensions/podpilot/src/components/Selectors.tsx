import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { BRAND_COLORS, podpilotTitle, tintedIcon } from "../lib/brand";
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
    <List navigationTitle={podpilotTitle("Select Context")}>
      {contexts.map((context) => {
        const favorite = favoriteContexts.includes(context);

        return (
          <List.Item
            key={context}
            title={context}
            icon={favorite ? tintedIcon(Icon.Star, BRAND_COLORS.gold) : tintedIcon(Icon.Globe, BRAND_COLORS.blue)}
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
                    icon={favorite ? tintedIcon(Icon.StarDisabled, BRAND_COLORS.gold) : tintedIcon(Icon.Star, BRAND_COLORS.gold)}
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
    <List navigationTitle={podpilotTitle("Select Namespace")}>
      {items.map((namespace) => {
        const isAll = isAllNamespaces(namespace);
        const favorite = favoriteNamespaces.includes(namespace);

        return (
          <List.Item
            key={namespace}
            title={formatNamespaceLabel(namespace)}
            icon={
              isAll
                ? tintedIcon(Icon.List, BRAND_COLORS.gold)
                : favorite
                  ? tintedIcon(Icon.Star, BRAND_COLORS.gold)
                  : tintedIcon(Icon.TextCursor, BRAND_COLORS.blue)
            }
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
                    icon={favorite ? tintedIcon(Icon.StarDisabled, BRAND_COLORS.gold) : tintedIcon(Icon.Star, BRAND_COLORS.gold)}
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
