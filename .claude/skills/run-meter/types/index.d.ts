/** What the band shows, counted from the last reset (`/run-meter`). */
export type Meter = {
  /** When counting started, in ms from `$.clock.now()`. */
  startedAt: number;
  /** The session's cost in US dollars when counting started, and now: the band shows the difference. */
  baseUsd: number;
  usd: number;
  /** Token counts summed over every model call since the reset, the main loop's and every subagent's. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Model calls since the reset. */
  calls: number;
  /** The subagents running now: agent id → subagent type. */
  running: Record<string, string>;
  /** When the counts last changed, in ms. */
  updatedAt: number;
};

declare module "claude-code" {
  interface PluginState {
    "run-meter": { meter: Shaped<Meter | null>; isHidden: boolean };
  }
}
