# Coolify SSH Multiplexing Race Condition

## Overview

Date: 2026-07-05
Affected deployment: `ApplicationDeploymentJob` at 01:38:46 UTC
Application: courtzon (UUID `k10fyzmeoemrg9agnrr90zfk`)
Coolify version: 4.x (self-hosted)
Docker version: 29.6.0, BuildKit v0.31.0, cgroup v2

## Root Cause

**A race condition in Coolify's SSH multiplexer (`SshMultiplexingHelper`) caused a deployment to fail mid-build.**

Coolify maintains a single shared SSH multiplexed ("mux") master connection to each server. All concurrent processes (queue workers, HTTP handlers, scheduled jobs) share this single master connection. When any process determines the master connection is no longer reusable (expired, failed health check), it calls `refreshMultiplexedConnection()`, which:

1. Sends `ssh -O exit` to the master connection — terminating **all** active channels
2. Establishes a new master connection

The deployment's SSH channel was an active channel on this master connection. When another process triggered a refresh, the deployment's channel was killed, the remote command (`docker compose build`) was orphaned, and the build failed.

## Timeline

All times in UTC on 2026-07-05.

| Time | Event |
|------|-------|
| 01:38:46 | `ApplicationDeploymentJob` starts |
| 01:38:46 | `ensureMultiplexedConnection()` acquires lock, validates mux, releases lock |
| 01:38:47 | Build helper container created, SSH command starts via mux channel |
| 01:38:48 | Helper container attached to `coolify` bridge network |
| 01:38:57 | BuildKit begins executing build steps (`npm ci` in builder + runner) |
| 01:38:56–01:39:00 | `ServerFilesFromServerJob` runs concurrently (no SSH usage) |
| 01:39:02.07 | BuildKit executor mount deactivates (normal stage completion) |
| 01:39:02.23 | Docker veth interface for BuildKit executor cleaned up |
| **01:39:02.48** | **`sshd: Received disconnect from 172.16.1.5:11: disconnected by user`** |
| 01:39:03 | Two new SSH sessions established from Coolify container (mux reconnection) |
| **01:39:04** | **`ApplicationDeploymentJob` FAIL (17s runtime)** |
| 01:39:08 | Docker daemon logs `context canceled` (cleanup after job failure) |
| 01:39:08 | BuildKit containers killed, veth interfaces removed |

## Evidence

### 1. SSH disconnect was client-initiated (reason code 11)

From `/var/log/auth.log` on the Coolify host:

```
Jul 05 01:39:02 srv1776860 sshd[1132655]: Received disconnect from 172.16.1.5 port 56876:11: disconnected by user
```

Reason code **11 = SSH2_DISCONNECT_BY_APPLICATION** (RFC 4253 §11.1). The SSH client inside the Coolify container intentionally closed the connection. This was **not** a network failure, timeout, or server-side kill.

### 2. The Coolify PHP code caught exit code 255

From the `failed_jobs` database table, the exception payload:

```
App\Exceptions\DeploymentException: Command execution failed (exit code 255):
docker exec rwbion3l6rm3lho4gbm31xot bash -c 'docker compose ... build ...'
```

Exit code 255 from SSH means the connection was lost before the remote command completed.

### 3. The `refreshMultiplexedConnection` code path

From `SshMultiplexingHelper.php`:

```php
public static function refreshMultiplexedConnection(Server $server): bool
{
    self::removeMuxFile($server);  // sends 'ssh -O exit' — kills ALL channels
    return self::establishNewMultiplexedConnection($server);
}
```

```php
public static function removeMuxFile(Server $server): void
{
    Process::run(self::muxControlCommand($server, 'exit'));  // exits master connection
    self::clearConnectionMetadata($server);
}
```

There is no check whether any active channel is in use before executing the exit. The lock (`ssh_mux_lock_*` with 30s TTL) only prevents concurrent establishment — it does not protect channels that are already running.

### 4. Build was healthy until the SSH disconnect

The Docker daemon logs at 01:39:08 show build containers being **killed** (not failing on their own):

```
container id fqcc3gmzcfn4cstc8n9dwez8e is taking a long time to exit after kill
  span="[builder 4/7] RUN npm ci --ignore-scripts"
container id tugtfvroklnn7t2dr6ij4bwpo is taking a long time to exit after kill
  span="[runner  5/13] RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force"
```

These containers were actively running build steps when killed. They did not fail — they were terminated externally.

## Why Docker Reported "context canceled"

The Docker daemon logged `context canceled` at 01:39:08:

```
error=/moby.buildkit.v1.Control/Solve error="rpc error: code = Canceled desc = context canceled"
```

This was a **consequence**, not the cause. The sequence:

1. SSH connection killed → `docker exec` process on host was orphaned
2. The `docker exec` process's stdin/stdout got a broken pipe
3. Docker/BuildKit detected the client connection was gone and cancelled the build context
4. All BuildKit containers were killed as part of the cancellation cleanup

The "context canceled" message means the BuildKit client (the docker compose build command running inside the helper container) stopped sending requests — because the SSH channel carrying its stdin/stdout was severed.

## Why Exit Code 255 Occurred

Exit code 255 is SSH's code for "connection error". The SSH client (running inside the Coolify container) was connected to the host's sshd through the mux master connection. When another process sent `ssh -O exit` to the master, the master closed all channels. The SSH client:

1. Lost its connection to the remote `bash` session running `docker compose build`
2. Could not retrieve the remote command's exit status
3. Exited with code 255 (SSH connection error)
4. The PHP `executeCommandWithProcess()` caught this and threw `DeploymentException`

## Why This Is a Coolify Platform Issue

All evidence points to Coolify's SSH multiplexing infrastructure, not the application:

| Aspect | Evidence |
|--------|----------|
| Build was running successfully | `npm ci` was in progress, no build errors |
| No application code involved in SSH management | The SSH code is in `SshMultiplexingHelper.php`, `ExecuteRemoteCommand.php` |
| All application containers remained healthy | All 4 containers continued running after the failure |
| Same build succeeded in previous deployment | `01:35:02→01:36:10` completed successfully with same commit |
| No OOM or resource exhaustion | 5.5 GiB available RAM, no OOM events |
| No timeout reached | Both job timeout (3600s) and command timeout (3600s) far exceeded 17s runtime |
| Client-initiated disconnect | Reason code 11 explicitly states the SSH client chose to disconnect |

## Conditions for Recurrence

The race condition can occur when:

1. **Multiple processes need concurrent SSH access** to the same Coolify-managed server
2. **The mux master connection reaches end-of-life** (`mux_max_age` = 1800s / 30 minutes default) while a deployment is in progress
3. **The mux health check fails** (`mux_health_check_enabled` = true by default) due to a transient issue while a channel is active
4. **A long-running deployment overlaps** with other SSH-using jobs (scheduled checks, server file syncs, other deployments)

## Possible Mitigations

### 1. Serialize deployment jobs (recommended)

In Coolify's server settings, set `concurrent_builds = 1` (or ensure it is already set). This prevents multiple deployments to the same server from running simultaneously, reducing the chance of mux channel contention.

### 2. Increase SSH mux configuration values

In Coolify's environment/configuration:

- Increase `SSH_MUX_MAX_AGE` (default 1800s) to a higher value to reduce the frequency of automatic refreshes
- Increase `SSH_MUX_HEALTH_CHECK_TIMEOUT` (default 5s) to reduce false health check failures
- Increase `SSH_MUX_PERSIST_TIME` (default 3600s)

These are tuning adjustments that reduce the probability but do not eliminate the race condition.

### 3. Disable SSH multiplexing

Coolify supports `SSH_MUX_ENABLED=false` (or `MUX_ENABLED=false`). This forces each SSH operation to open its own independent connection. Trade-offs:

- **Pro:** Eliminates the shared-master race condition entirely
- **Con:** Each SSH operation pays the full TCP handshake + key exchange overhead (~1-2 seconds)
- **Con:** No connection reuse, higher latency for frequent small operations

For a production deployment with infrequent (but long-running) SSH operations like Docker builds, the overhead is acceptable.

### 4. Upgrade Coolify when fixed

This is a known class of issue with SSH multiplexing when channels are shared without reference counting. If a future Coolify version adds channel tracking or per-command connection isolation, upgrade to resolve it properly.

### 5. Monitor for recurrence

Watch for the following signals in Coolify host logs:

- `sshd.*Received disconnect.*11: disconnected by user` during active deployments
- `failed_jobs` table entries with `DeploymentException: Command execution failed (exit code 255)`
- Deployment failures that last <60 seconds (too short for a build timeout, suggesting connection interruption)

## References

- Coolify source: `app/Helpers/SshMultiplexingHelper.php`
- Coolify source: `app/Traits/ExecuteRemoteCommand.php`
- Coolify source: `app/Jobs/ApplicationDeploymentJob.php` (line 232: `$this->timeout = $this->server->settings->dynamic_timeout`)
- SSH disconnect reasons: RFC 4253 §11.1
- Investigation log: `~/.ssh/courtzon_deploy` key on Coolify host (187.127.72.93)
