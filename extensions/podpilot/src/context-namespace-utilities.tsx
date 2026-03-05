import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { useMemo } from "react";
import { ErrorDetail } from "./components/ErrorDetail";
import { BRAND_COLORS, podpilotTitle, tintedIcon } from "./lib/brand";
import { setCurrentContext } from "./lib/kube-data";
import { useContextNamespace } from "./lib/use-context-namespace";

export default function ContextNamespaceUtilitiesCommand() {
  const state = useContextNamespace();

  const accessory = useMemo(
    () => (
      <List.Dropdown
        tooltip="Namespace context"
        value={state.selectedContext || undefined}
        onChange={(value) => {
          state.setSelectedContext(value);
        }}
      >
        {state.contexts.map((context) => (
          <List.Dropdown.Item key={context} value={context} title={context} />
        ))}
      </List.Dropdown>
    ),
    [state.contexts, state.selectedContext],
  );

  if (state.error) {
    return <ErrorDetail title="Failed to load context data" error={state.error} />;
  }

  return (
    <List
      isLoading={state.isLoadingContexts || state.isLoadingNamespaces}
      navigationTitle={podpilotTitle("Context and Namespace Utilities")}
      searchBarAccessory={accessory}
    >
      <List.Section title="Contexts">
        {state.contexts.map((context) => {
          const favorite = state.favoriteContexts.includes(context);
          const current = context === state.selectedContext;

          return (
            <List.Item
              key={context}
              title={context}
              icon={
                favorite
                  ? tintedIcon(Icon.Star, BRAND_COLORS.gold)
                  : tintedIcon(Icon.Globe, current ? BRAND_COLORS.sky : BRAND_COLORS.navy)
              }
              accessories={current ? [{ text: "Selected" }] : []}
              actions={
                <ActionPanel>
                  <Action
                    title="Switch Current Context"
                    icon={tintedIcon(Icon.ArrowClockwise, BRAND_COLORS.sky)}
                    onAction={async () => {
                      const toast = await showToast({ style: Toast.Style.Animated, title: `Switching to ${context}` });
                      try {
                        await setCurrentContext(context);
                        state.setSelectedContext(context);
                        await state.refresh();
                        toast.style = Toast.Style.Success;
                        toast.title = `Current context: ${context}`;
                      } catch (error) {
                        toast.style = Toast.Style.Failure;
                        toast.title = "Failed to switch context";
                        toast.message = error instanceof Error ? error.message : String(error);
                      }
                    }}
                  />
                  <Action
                    title={favorite ? "Remove Favorite Context" : "Favorite Context"}
                    icon={
                      favorite
                        ? tintedIcon(Icon.StarDisabled, BRAND_COLORS.gold)
                        : tintedIcon(Icon.Star, BRAND_COLORS.gold)
                    }
                    onAction={async () => {
                      await state.toggleContextFavorite(context);
                    }}
                  />
                  <Action
                    title="Use for Namespace Section"
                    icon={tintedIcon(Icon.TextCursor, BRAND_COLORS.blue)}
                    onAction={() => {
                      state.setSelectedContext(context);
                    }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>

      <List.Section title={`Namespaces (${state.selectedContext || "No context"})`}>
        {state.namespaces.map((namespace) => {
          const favorite = state.favoriteNamespaces.includes(namespace);
          const selected = namespace === state.selectedNamespace;

          return (
            <List.Item
              key={namespace}
              title={namespace}
              icon={
                favorite
                  ? tintedIcon(Icon.Star, BRAND_COLORS.gold)
                  : tintedIcon(Icon.TextCursor, selected ? BRAND_COLORS.sky : BRAND_COLORS.blue)
              }
              accessories={selected ? [{ text: "Selected" }] : []}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Namespace"
                    icon={tintedIcon(Icon.Checkmark, BRAND_COLORS.sky)}
                    onAction={() => {
                      state.setSelectedNamespace(namespace);
                    }}
                  />
                  <Action
                    title="Set as Default Namespace"
                    icon={tintedIcon(Icon.Pin, BRAND_COLORS.orange)}
                    onAction={async () => {
                      await state.saveDefaultNamespace(namespace);
                      const toast = await showToast({ style: Toast.Style.Success, title: "Default namespace saved" });
                      toast.message = `${state.selectedContext}: ${namespace}`;
                    }}
                  />
                  <Action
                    title={favorite ? "Remove Favorite Namespace" : "Favorite Namespace"}
                    icon={
                      favorite
                        ? tintedIcon(Icon.StarDisabled, BRAND_COLORS.gold)
                        : tintedIcon(Icon.Star, BRAND_COLORS.gold)
                    }
                    onAction={async () => {
                      await state.toggleNamespaceFavorite(namespace);
                    }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
