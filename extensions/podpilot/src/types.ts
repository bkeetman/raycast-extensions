export type ResourceTab = "pods" | "deployments" | "services" | "jobs" | "cronjobs";

export type TerminalApp = "terminal" | "iterm";

export interface ExtensionPreferences {
  kubectlPath?: string;
  awsPath?: string;
  terminalApp?: TerminalApp;
  execShell?: string;
  kubectlTimeoutMs?: string;
}

export interface KubectlResult {
  stdout: string;
  stderr: string;
  command: string;
}

export interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

export interface K8sMetadata {
  name: string;
  namespace?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
}

export interface LabelSelectorExpression {
  key: string;
  operator: string;
  values?: string[];
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: LabelSelectorExpression[];
}

export interface Pod {
  metadata: K8sMetadata;
  spec?: {
    nodeName?: string;
    containers?: Array<{ name: string; image?: string }>;
  };
  status?: {
    phase?: string;
    containerStatuses?: Array<{
      name: string;
      ready?: boolean;
      restartCount?: number;
      state?: {
        waiting?: { reason?: string; message?: string };
        terminated?: { reason?: string; message?: string };
      };
    }>;
  };
}

export interface Deployment {
  metadata: K8sMetadata;
  spec?: {
    replicas?: number;
    selector?: LabelSelector;
    template?: {
      spec?: {
        containers?: Array<{ name: string; image?: string }>;
      };
    };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    updatedReplicas?: number;
    availableReplicas?: number;
  };
}

export interface Service {
  metadata: K8sMetadata;
  spec?: {
    type?: string;
    clusterIP?: string;
    ports?: Array<{ port?: number; targetPort?: number | string; protocol?: string }>;
  };
}

export interface Job {
  metadata: K8sMetadata;
  spec?: {
    completions?: number;
  };
  status?: {
    active?: number;
    failed?: number;
    succeeded?: number;
  };
}

export interface CronJob {
  metadata: K8sMetadata;
  spec?: {
    schedule?: string;
    suspend?: boolean;
  };
  status?: {
    lastScheduleTime?: string;
  };
}

export interface K8sList<T> {
  items: T[];
}
