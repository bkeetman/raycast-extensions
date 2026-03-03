# PodPilot (Raycast Extension)

![PodPilot Logo](assets/podpilot.png)

PodPilot is a Raycast extension for daily Kubernetes operations using your existing `kubectl` CLI and kubeconfig auth chain.

## Features

### Browse Resources
- Select context and namespace
- Browse Pods, Deployments, Services, Jobs, and CronJobs in one command
- Useful status fields are shown inline (ready, age, node, images)

### Pod Actions
- Tail logs (container selection + follow stream)
- Copy logs (last N lines)
- Exec shell (opens Terminal.app or iTerm with generated `kubectl exec -it ...`)
- Restart pod (delete with confirmation)
- Port-forward (custom local/remote ports, optional browser open)

### Deployment Actions
- Rollout restart
- Rollout status
- Undo rollout (confirmation)
- Scale replicas (confirmation)
- Show deployment events

### Context/Namespace Utilities
- Quick switch current context (`kubectl config use-context`)
- Set default namespace per context (stored in Raycast local storage)
- Favorite contexts and namespaces (favorites shown first)

### Diagnostics
- Shows configured and detected `kubectl`/`aws` paths
- Shows versions for both binaries
- Shows current context
- Verifies whether `kubectl get ns` succeeds

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start development mode:

```bash
npm run dev
```

3. In Raycast extension preferences, configure:
- `kubectl Path` (default `kubectl`)
- `aws Path` (default `aws`)
- `Terminal App` (`Terminal.app` or `iTerm`)
- `Preferred Exec Shell` (default `/bin/sh`)
- `kubectl Timeout (ms)` (default `15000`)

## PATH and Auth Caveats

Raycast runs as a GUI app and may not inherit your full shell PATH. To avoid auth/plugin failures:
- Prefer absolute paths when needed (for example `/opt/homebrew/bin/kubectl` and `/opt/homebrew/bin/aws`)
- KubeOps prepends configured `kubectl` and `aws` directories to `PATH` for command execution
- This allows kubeconfig exec plugins (including EKS with `aws eks get-token`) to work more reliably

## Apple Silicon

PodPilot works on Apple Silicon as long as your configured `kubectl`/`aws` binaries are installed and executable for your architecture.

## Screenshots

Add screenshots at these paths:
- `assets/screenshots/browse-resources.png`
- `assets/screenshots/pod-actions.png`
- `assets/screenshots/deployment-actions.png`
- `assets/screenshots/diagnostics.png`

Example markdown placeholders:

```md
![Browse Resources](assets/screenshots/browse-resources.png)
![Pod Actions](assets/screenshots/pod-actions.png)
![Deployment Actions](assets/screenshots/deployment-actions.png)
![Diagnostics](assets/screenshots/diagnostics.png)
```
