export interface TrayProxyLive { port: number }

export interface TrayProxyServiceState {
  installed: boolean;
  startable: boolean;
  summary: string;
}

export interface TrayProxyStartIo {
  findLive: () => Promise<TrayProxyLive | null>;
  diagnoseService: () => TrayProxyServiceState;
  startService: () => void | Promise<void>;
  startDirect: () => void | Promise<void>;
  waitForProxy: () => Promise<TrayProxyLive | null>;
  info: (message: string) => void;
  error: (message: string) => void;
  /**
   * Called once a live proxy is confirmed on `port` — whether it was already running or
   * this call just started it. `handleEnsure` performs the Grok-fence and Codex-model
   * sync inline in both of its branches; this action skipped both entirely (devlog 260727
   * grok-fence-parity: `ocx restart` losing them was caught by tests/grok-lifecycle.test.ts
   * after restart was repointed at this action to fix the codexAutoStart no-op). Optional
   * so tests that don't care about the sync can omit it.
   */
  onStarted?: (port: number) => void | Promise<void>;
}

/** Side-effect coordinator for the tray's fixed proxy-start action. */
export async function runTrayProxyStart(io: TrayProxyStartIo): Promise<boolean> {
  const live = await io.findLive();
  if (live) {
    io.info(`Proxy already running on port ${live.port}.`);
    await io.onStarted?.(live.port);
    return true;
  }

  const service = io.diagnoseService();
  if (service.installed && !service.startable) {
    io.error(`Cannot start from the tray because the installed service is not viable: ${service.summary}`);
    io.error("Repair or remove the service before starting a direct proxy.");
    return false;
  }

  if (service.startable) await io.startService();
  else await io.startDirect();

  const started = await io.waitForProxy();
  if (!started) {
    io.error("Proxy did not become healthy after the tray start action.");
    return false;
  }
  io.info(`Proxy running on port ${started.port}.`);
  await io.onStarted?.(started.port);
  return true;
}

export async function runTrayProxyRestart(io: {
  stop: () => boolean | Promise<boolean>;
  start: () => boolean | Promise<boolean>;
}): Promise<boolean> {
  if (!await io.stop()) return false;
  return io.start();
}
