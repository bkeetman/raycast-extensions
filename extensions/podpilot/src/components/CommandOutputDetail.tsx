import { Action, ActionPanel, Detail } from "@raycast/api";
import { useEffect, useState } from "react";
import { formatErrorMarkdown } from "../lib/error-markdown";

interface CommandOutputDetailProps {
  title: string;
  subtitle?: string;
  run: (signal: AbortSignal) => Promise<{ markdown: string; raw?: string }>;
}

export function CommandOutputDetail({ title, subtitle, run }: CommandOutputDetailProps) {
  const [state, setState] = useState<{ isLoading: boolean; markdown: string; raw?: string; error?: unknown }>({
    isLoading: true,
    markdown: "",
  });

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, isLoading: true, error: undefined }));
    run(controller.signal)
      .then((output) => {
        setState({ isLoading: false, markdown: output.markdown, raw: output.raw });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          isLoading: false,
          markdown: formatErrorMarkdown(title, error),
          error,
        });
      });

    return () => {
      controller.abort();
    };
  }, [run, title]);

  return (
    <Detail
      isLoading={state.isLoading}
      navigationTitle={title}
      markdown={state.markdown || `# ${title}\n\nLoading...`}
      metadata={
        subtitle ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Context" text={subtitle} />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {state.raw ? <Action.CopyToClipboard title="Copy Output" content={state.raw} /> : null}
          <Action.CopyToClipboard title="Copy Markdown" content={state.markdown} />
        </ActionPanel>
      }
    />
  );
}
