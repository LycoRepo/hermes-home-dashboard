declare module "@hermes/plugin-sdk" {
  import type { ReactNode } from "react";

  export interface PluginRestOptions {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
  }

  export interface PluginContribution {
    id: string;
    area: string;
    title?: string;
    order?: number;
    data?: unknown;
    render?: () => ReactNode;
  }

  export interface PluginContext {
    readonly source: string;
    register(contribution: PluginContribution): () => void;
    registerMany(contributions: PluginContribution[]): () => void;
    rest<T>(path: string, options?: PluginRestOptions): Promise<T>;
  }

  export interface HermesPlugin {
    id: string;
    name?: string;
    defaultEnabled?: boolean;
    register(ctx: PluginContext): void;
  }

  export interface RpcEvent<T = unknown> {
    type: string;
    payload?: T;
    session_id?: string;
    profile?: string;
  }

  export const host: {
    status(): Promise<unknown>;
    logs(params: {
      file?: string;
      lines?: number;
      level?: string;
      component?: string;
    }): Promise<unknown>;
    navigate(path: string): void;
    /** Subscribe to live gateway events by type ('*' = everything). Returns a disposer. */
    onEvent(type: string, listener: (event: RpcEvent) => void): () => void;
  };
}
