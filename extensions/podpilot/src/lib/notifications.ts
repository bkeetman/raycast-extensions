import { Toast, showToast } from "@raycast/api";
import { formatErrorMarkdown } from "./error-markdown";

export async function showSuccess(message: string): Promise<void> {
  await showToast({ style: Toast.Style.Success, title: message });
}

export async function showFailure(title: string, error: unknown): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Failure, title });
  toast.message = error instanceof Error ? error.message : String(error);
}

export function renderFailureMarkdown(title: string, error: unknown): string {
  return formatErrorMarkdown(title, error);
}
