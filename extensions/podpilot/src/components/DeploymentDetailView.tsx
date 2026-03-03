import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Form,
  Icon,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { FormValidation, useForm } from "@raycast/utils";
import { useCallback } from "react";
import { clearResourceCache, getDeploymentEvents } from "../lib/kube-data";
import { deploymentImages, deploymentReadyStatus } from "../lib/k8s-display";
import { runKubectl } from "../lib/kubectl";
import { formatAge, formatTimestamp } from "../lib/time";
import { Deployment } from "../types";
import { CommandOutputDetail } from "./CommandOutputDetail";

interface DeploymentDetailViewProps {
  context: string;
  namespace: string;
  deployment: Deployment;
  onMutated?: () => Promise<void> | void;
}

interface ScaleValues {
  replicas: string;
}

export function DeploymentDetailView({ context, namespace, deployment, onMutated }: DeploymentDetailViewProps) {
  const name = deployment.metadata.name;

  const markdown = `# ${name}

- **Context:** ${context}
- **Namespace:** ${namespace}
- **Ready:** ${deploymentReadyStatus(deployment)}
- **Age:** ${formatAge(deployment.metadata.creationTimestamp)}
- **Created:** ${formatTimestamp(deployment.metadata.creationTimestamp)}
- **Images:** ${deploymentImages(deployment)}
`;

  const runMutation = useCallback(
    async (title: string, command: () => Promise<void>) => {
      const toast = await showToast({ style: Toast.Style.Animated, title });
      try {
        await command();
        clearResourceCache(context, namespace);
        await onMutated?.();
        toast.style = Toast.Style.Success;
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.message = error instanceof Error ? error.message : String(error);
      }
    },
    [context, namespace, onMutated],
  );

  return (
    <Detail
      navigationTitle={name}
      markdown={markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Rollout">
            <Action
              title="Rollout Restart"
              icon={Icon.RotateClockwise}
              onAction={async () => {
                await runMutation("Restarting rollout", async () => {
                  await runKubectl(["rollout", "restart", `deploy/${name}`], { context, namespace });
                });
              }}
            />
            <Action.Push
              title="Rollout Status"
              icon={Icon.ArrowClockwise}
              target={
                <CommandOutputDetail
                  title={`Rollout Status: ${name}`}
                  subtitle={`${context}/${namespace}`}
                  run={async (signal) => {
                    const result = await runKubectl(["rollout", "status", `deploy/${name}`], {
                      context,
                      namespace,
                      signal,
                    });
                    return {
                      markdown: `# Rollout Status\n\n\`\`\`\n${result.stdout || "(no output)"}\n\`\`\``,
                      raw: result.stdout,
                    };
                  }}
                />
              }
            />
            <Action
              title="Undo Rollout"
              icon={Icon.ArrowClockwise}
              style={Action.Style.Destructive}
              onAction={async () => {
                const confirmed = await confirmAlert({
                  title: `Undo rollout for ${name}?`,
                  message: "This reverts to the previous deployment revision.",
                  primaryAction: {
                    title: "Undo Rollout",
                    style: Alert.ActionStyle.Destructive,
                  },
                });

                if (!confirmed) {
                  return;
                }

                await runMutation("Undoing rollout", async () => {
                  await runKubectl(["rollout", "undo", `deploy/${name}`], { context, namespace });
                });
              }}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Scale and Events">
            <Action.Push
              title="Scale Replicas"
              icon={Icon.BarChart}
              target={<ScaleDeploymentForm context={context} namespace={namespace} deploymentName={name} onMutated={onMutated} />}
            />
            <Action.Push
              title="Show Events"
              icon={Icon.List}
              target={
                <CommandOutputDetail
                  title={`Deployment Events: ${name}`}
                  subtitle={`${context}/${namespace}`}
                  run={async () => {
                    const output = await getDeploymentEvents(context, namespace, name);
                    return {
                      markdown: `# Events\n\n\`\`\`\n${output || "(no events found)"}\n\`\`\``,
                      raw: output,
                    };
                  }}
                />
              }
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function ScaleDeploymentForm({
  context,
  namespace,
  deploymentName,
  onMutated,
}: {
  context: string;
  namespace: string;
  deploymentName: string;
  onMutated?: () => Promise<void> | void;
}) {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<ScaleValues>({
    initialValues: {
      replicas: "1",
    },
    validation: {
      replicas: FormValidation.Required,
    },
    onSubmit: async (values) => {
      const replicas = Number.parseInt(values.replicas, 10);
      if (!Number.isFinite(replicas) || replicas < 0) {
        await showToast({ style: Toast.Style.Failure, title: "Replicas must be a non-negative integer" });
        return;
      }

      const confirmed = await confirmAlert({
        title: `Scale ${deploymentName} to ${replicas}?`,
        message: "Scaling changes live traffic behavior. Confirm before applying.",
        primaryAction: {
          title: "Scale Deployment",
          style: Alert.ActionStyle.Destructive,
        },
      });

      if (!confirmed) {
        return;
      }

      const toast = await showToast({ style: Toast.Style.Animated, title: "Scaling deployment" });
      try {
        await runKubectl(["scale", `deploy/${deploymentName}`, `--replicas=${replicas}`], { context, namespace });
        clearResourceCache(context, namespace);
        await onMutated?.();
        toast.style = Toast.Style.Success;
        toast.title = "Deployment scaled";
        pop();
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to scale deployment";
        toast.message = error instanceof Error ? error.message : String(error);
      }
    },
  });

  return (
    <Form
      navigationTitle="Scale Deployment"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Scale" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Replicas" {...itemProps.replicas} />
    </Form>
  );
}
