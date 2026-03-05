import { CronJob, Deployment, Job, Pod, Service } from "../types";
import { formatAge } from "./time";

export function podReadyStatus(pod: Pod): string {
  const statuses = pod.status?.containerStatuses ?? [];
  if (statuses.length === 0) {
    return "0/0";
  }

  const ready = statuses.filter((status) => status.ready).length;
  return `${ready}/${statuses.length}`;
}

export function podStatus(pod: Pod): string {
  const waiting = pod.status?.containerStatuses?.find((status) => status.state?.waiting?.reason)?.state?.waiting
    ?.reason;
  if (waiting) {
    return waiting;
  }

  const terminated = pod.status?.containerStatuses?.find((status) => status.state?.terminated?.reason)?.state
    ?.terminated?.reason;
  if (terminated) {
    return terminated;
  }

  return pod.status?.phase ?? "Unknown";
}

export function podSubtitle(pod: Pod): string {
  const node = pod.spec?.nodeName ?? "-";
  const age = formatAge(pod.metadata.creationTimestamp);
  return `Ready ${podReadyStatus(pod)} • ${podStatus(pod)} • ${age} • Node ${node}`;
}

export function podContainers(pod: Pod): string[] {
  return pod.spec?.containers?.map((container) => container.name) ?? [];
}

export function deploymentReadyStatus(deployment: Deployment): string {
  const ready = deployment.status?.readyReplicas ?? 0;
  const desired = deployment.spec?.replicas ?? deployment.status?.replicas ?? 0;
  return `${ready}/${desired}`;
}

export function deploymentImages(deployment: Deployment): string {
  const images = deploymentImageList(deployment);
  if (images.length === 0) {
    return "-";
  }

  const shown = images.slice(0, 3).map((image) => truncate(image, 44));
  if (images.length > 3) {
    return `${shown.join(", ")} (+${images.length - 3} more)`;
  }

  return shown.join(", ");
}

export function deploymentSubtitle(deployment: Deployment): string {
  const age = formatAge(deployment.metadata.creationTimestamp);
  return `Ready ${deploymentReadyStatus(deployment)} • ${age} • ${deploymentPrimaryImage(deployment)}`;
}

export function serviceSummary(service: Service): string {
  const type = service.spec?.type ?? "ClusterIP";
  const clusterIp = service.spec?.clusterIP ?? "-";
  const ports = (service.spec?.ports ?? [])
    .map((port) => `${port.port ?? "?"}/${(port.protocol ?? "TCP").toUpperCase()}`)
    .join(", ");

  return `${type} • ${clusterIp} • ${ports || "No ports"} • ${formatAge(service.metadata.creationTimestamp)}`;
}

export function jobSummary(job: Job): string {
  const done = job.status?.succeeded ?? 0;
  const target = job.spec?.completions ?? done;
  const active = job.status?.active ?? 0;
  const failed = job.status?.failed ?? 0;

  return `Done ${done}/${target} • Active ${active} • Failed ${failed} • ${formatAge(job.metadata.creationTimestamp)}`;
}

export function cronJobSummary(cronJob: CronJob): string {
  const schedule = cronJob.spec?.schedule ?? "-";
  const suspended = cronJob.spec?.suspend ? "Suspended" : "Active";
  const last = formatAge(cronJob.status?.lastScheduleTime);

  return `${schedule} • ${suspended} • Last ${last}`;
}

export function deploymentPrimaryImage(deployment: Deployment): string {
  const images = deploymentImageList(deployment);
  if (images.length === 0) {
    return "-";
  }

  const primary = truncate(images[0], 34);
  return images.length > 1 ? `${primary} (+${images.length - 1})` : primary;
}

function deploymentImageList(deployment: Deployment): string[] {
  const rawImages = deployment.spec?.template?.spec?.containers?.map((container) => container.image).filter(Boolean) as
    | string[]
    | undefined;
  if (!rawImages || rawImages.length === 0) {
    return [];
  }

  return rawImages.map(normalizeImageReference);
}

function normalizeImageReference(image: string): string {
  const [withTag, digest] = image.split("@");
  const parts = withTag.split("/");
  const hasRegistryHost = parts.length > 1 && isRegistryHost(parts[0]);
  const withoutRegistry = hasRegistryHost ? parts.slice(1).join("/") : withTag;

  if (!digest) {
    return withoutRegistry;
  }

  if (digest.startsWith("sha256:")) {
    return `${withoutRegistry}@${digest.slice(0, 14)}`;
  }

  return `${withoutRegistry}@${digest}`;
}

function isRegistryHost(part: string): boolean {
  return part.includes(".") || part.includes(":") || part === "localhost";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
