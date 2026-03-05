import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { BRAND_COLORS, tintedIcon } from "../lib/brand";
import { formatNamespaceLabel } from "../lib/namespace";
import { ContextNamespaceState } from "../lib/use-context-namespace";
import { SelectContextList, SelectNamespaceList } from "./Selectors";
import { TargetPickerForm } from "./TargetPickerForm";

interface TargetSectionProps {
  state: ContextNamespaceState;
  onRefreshResources: () => Promise<void> | void;
  onReloadTargets: () => Promise<void> | void;
}

export function TargetSection({ state, onRefreshResources, onReloadTargets }: TargetSectionProps) {
  return (
    <List.Section title="PodPilot Target">
      <List.Item
        title={state.selectedContext || "No context"}
        subtitle={formatNamespaceLabel(state.selectedNamespace)}
        icon="podpilot.png"
        accessories={[
          {
            tag: {
              value: "Context / Namespace",
              color: BRAND_COLORS.gold,
            },
          },
        ]}
        actions={
          <ActionPanel>
            <Action.Push
              title="Change Target (Context + Namespace)"
              icon={tintedIcon(Icon.BullsEye, BRAND_COLORS.blue)}
              target={
                <TargetPickerForm
                  contexts={state.contexts}
                  initialContext={state.selectedContext}
                  initialNamespace={state.selectedNamespace}
                  onApply={(context, namespace) => {
                    state.setSelectedContext(context);
                    state.setSelectedNamespace(namespace);
                  }}
                  includeAllNamespaces
                />
              }
            />
            <Action.Push
              title="Switch Context"
              icon={tintedIcon(Icon.Globe, BRAND_COLORS.sky)}
              target={
                <SelectContextList
                  contexts={state.contexts}
                  selectedContext={state.selectedContext}
                  favoriteContexts={state.favoriteContexts}
                  onSelect={state.setSelectedContext}
                  onToggleFavorite={state.toggleContextFavorite}
                />
              }
            />
            <Action.Push
              title="Switch Namespace"
              icon={tintedIcon(Icon.TextCursor, BRAND_COLORS.gold)}
              target={
                <SelectNamespaceList
                  namespaces={state.namespaces}
                  selectedNamespace={state.selectedNamespace}
                  favoriteNamespaces={state.favoriteNamespaces}
                  onSelect={state.setSelectedNamespace}
                  onToggleFavorite={state.toggleNamespaceFavorite}
                  includeAllOption
                />
              }
            />
            <Action
              title="Refresh Resources"
              icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)}
              onAction={onRefreshResources}
            />
            <Action
              title="Reload Targets"
              icon={tintedIcon(Icon.Repeat, BRAND_COLORS.orange)}
              onAction={onReloadTargets}
            />
          </ActionPanel>
        }
      />
    </List.Section>
  );
}
