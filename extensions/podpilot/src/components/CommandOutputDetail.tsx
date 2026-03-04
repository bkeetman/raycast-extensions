import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useEffect, useState } from "react";
import { BRAND_COLORS, podpilotHeader, podpilotTitle, tintedIcon } from "../lib/brand";
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

  const metadata = (() => {
    if (!subtitle) {
      return undefined;
    }

    const [context, namespace] = subtitle.split("/", 2);
    return (
      <Detail.Metadata>
        <Detail.Metadata.Label title="Workspace" text="PodPilot" icon="podpilot.png" />
        <Detail.Metadata.Label title="Context" text={context} icon={tintedIcon(Icon.Globe, BRAND_COLORS.sky)} />
        {namespace ? <Detail.Metadata.Label title="Namespace" text={namespace} icon={tintedIcon(Icon.TextCursor, BRAND_COLORS.gold)} /> : null}
      </Detail.Metadata>
    );
  })();

  return (
    <Detail
      isLoading={state.isLoading}
      navigationTitle={podpilotTitle(title)}
      markdown={state.markdown || `${podpilotHeader(title)}Loading...`}
      metadata={metadata}
      actions={
        <ActionPanel>
          {state.raw ? <Action.CopyToClipboard title="Copy Output" content={state.raw} /> : null}
          <Action.CopyToClipboard title="Copy Markdown" content={state.markdown} />
        </ActionPanel>
      }
    />
  );
}
