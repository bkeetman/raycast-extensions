import { Action, ActionPanel, Form, Icon, Toast, showToast, useNavigation } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { BRAND_COLORS, podpilotTitle, tintedIcon } from "../lib/brand";
import { listNamespaces } from "../lib/kube-data";
import { ALL_NAMESPACES, ALL_NAMESPACES_LABEL, formatNamespaceLabel, isAllNamespaces } from "../lib/namespace";

interface TargetPickerFormProps {
  contexts: string[];
  initialContext: string;
  initialNamespace: string;
  onApply: (context: string, namespace: string) => void;
  includeAllNamespaces?: boolean;
}

export function TargetPickerForm({
  contexts,
  initialContext,
  initialNamespace,
  onApply,
  includeAllNamespaces = true,
}: TargetPickerFormProps) {
  const { pop } = useNavigation();
  const [context, setContext] = useState<string>(initialContext || contexts[0] || "");
  const [namespace, setNamespace] = useState<string>(includeAllNamespaces ? ALL_NAMESPACES : "");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState<boolean>(false);

  useEffect(() => {
    if (!context) {
      setNamespaces([]);
      return;
    }

    const controller = new AbortController();
    setIsLoadingNamespaces(true);

    listNamespaces(context, { signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }

        setNamespaces(items);
        setNamespace((current) => {
          if (current && (isAllNamespaces(current) || items.includes(current))) {
            return current;
          }

          const preferredNamespace = context === initialContext ? initialNamespace : "";
          if (preferredNamespace && (isAllNamespaces(preferredNamespace) || items.includes(preferredNamespace))) {
            return preferredNamespace;
          }

          if (includeAllNamespaces) {
            return ALL_NAMESPACES;
          }

          if (items.includes("default")) {
            return "default";
          }

          return items[0] ?? "";
        });
      })
      .catch(async (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const toast = await showToast({ style: Toast.Style.Failure, title: "Failed to load namespaces" });
        toast.message = error instanceof Error ? error.message : String(error);
        setNamespaces([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingNamespaces(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [context, includeAllNamespaces, initialContext, initialNamespace]);

  const namespaceItems = useMemo(
    () => (includeAllNamespaces ? [ALL_NAMESPACES, ...namespaces] : namespaces),
    [includeAllNamespaces, namespaces],
  );

  const selectedNamespaceValue = useMemo(() => {
    if (namespaceItems.includes(namespace)) {
      return namespace;
    }

    if (includeAllNamespaces && namespaceItems.includes(ALL_NAMESPACES)) {
      return ALL_NAMESPACES;
    }

    return namespaceItems[0] ?? "";
  }, [includeAllNamespaces, namespace, namespaceItems]);

  return (
    <Form
      navigationTitle={podpilotTitle("Change Target")}
      isLoading={isLoadingNamespaces}
      actions={
        <ActionPanel>
          <Action
            title="Apply Target"
            icon={tintedIcon(Icon.Checkmark, BRAND_COLORS.sky)}
            onAction={() => {
              const selectedNamespace = selectedNamespaceValue;
              if (!context || !selectedNamespace) {
                void showToast({ style: Toast.Style.Failure, title: "Select both context and namespace" });
                return;
              }

              onApply(context, selectedNamespace);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Step 1: choose context. Step 2: choose namespace." />
      <Form.Dropdown id="context" title="Context" value={context} onChange={setContext}>
        {contexts.map((item) => (
          <Form.Dropdown.Item key={item} value={item} title={item} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="namespace" title="Namespace" value={selectedNamespaceValue} onChange={setNamespace}>
        {namespaceItems.map((item) => (
          <Form.Dropdown.Item
            key={item}
            value={item}
            title={formatNamespaceLabel(item)}
            icon={item === ALL_NAMESPACES ? tintedIcon(Icon.List, BRAND_COLORS.gold) : undefined}
          />
        ))}
      </Form.Dropdown>
      {includeAllNamespaces ? <Form.Description text={`${ALL_NAMESPACES_LABEL}: list resources across every namespace`} /> : null}
    </Form>
  );
}
