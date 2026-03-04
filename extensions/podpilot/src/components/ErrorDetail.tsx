import { Action, ActionPanel, Detail } from "@raycast/api";
import { podpilotTitle } from "../lib/brand";
import { formatErrorMarkdown } from "../lib/error-markdown";

interface ErrorDetailProps {
  title: string;
  error: unknown;
}

export function ErrorDetail({ title, error }: ErrorDetailProps) {
  const markdown = formatErrorMarkdown(title, error);

  return (
    <Detail
      navigationTitle={podpilotTitle("Error")}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Error" content={markdown} />
        </ActionPanel>
      }
    />
  );
}
