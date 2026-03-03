import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { useMemo } from "react";
import { ErrorDetail } from "./components/ErrorDetail";
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
      navigationTitle="Context and Namespace Utilities"
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
              icon={favorite ? Icon.Star : Icon.Globe}
              accessories={current ? [{ text: "Selected" }] : []}
              actions={
                <ActionPanel>
                  <Action
                    title="Switch Current Context"
                    icon={Icon.ArrowClockwise}
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
                    icon={favorite ? Icon.StarDisabled : Icon.Star}
                    onAction={async () => {
                      await state.toggleContextFavorite(context);
                    }}
                  />
                  <Action
                    title="Use for Namespace Section"
                    icon={Icon.TextCursor}
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
              icon={favorite ? Icon.Star : Icon.TextCursor}
              accessories={selected ? [{ text: "Selected" }] : []}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Namespace"
                    icon={Icon.Checkmark}
                    onAction={() => {
                      state.setSelectedNamespace(namespace);
                    }}
                  />
                  <Action
                    title="Set as Default Namespace"
                    icon={Icon.Pin}
                    onAction={async () => {
                      await state.saveDefaultNamespace(namespace);
                      const toast = await showToast({ style: Toast.Style.Success, title: "Default namespace saved" });
                      toast.message = `${state.selectedContext}: ${namespace}`;
                    }}
                  />
                  <Action
                    title={favorite ? "Remove Favorite Namespace" : "Favorite Namespace"}
                    icon={favorite ? Icon.StarDisabled : Icon.Star}
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
