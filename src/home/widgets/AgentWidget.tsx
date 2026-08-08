import { enterTheater } from "../theater";
import type { HomeData } from "../useHomeData";
import { useAgentLive } from "./agent/agentLive";

interface Props {
  data: HomeData;
  editing: boolean;
}

function fmtCost(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n < 0.01) return `$${(n * 1000).toFixed(2)}m`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTok(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** The agent eye — a compact live view of what the AI is doing, with the
 *  "take control" button that opens the fullscreen AgentTheater. */
export function AgentWidget({ data, editing }: Props) {
  const live = useAgentLive();
  const analytics = data.analytics;
  const totals = analytics?.totals;

  const statusLabel = live.busy
    ? live.currentTool ? "working" : "thinking"
    : "idle";

  return (
    <div className="home-agent">
      <div className="home-agent-head">
        <span className={`home-agent-dot ${live.busy ? "busy" : ""}`} aria-hidden="true" />
        <span className="home-agent-status">{statusLabel}</span>
        {live.currentTool && (
          <span className="home-agent-tool">⚡{live.currentTool.name}</span>
        )}
        {!editing && (
          <button
            className="home-agent-take"
            onClick={() => enterTheater()}
            title="Take control of the screen — live agent theater"
            aria-label="Take control"
          >
            🎬 take control
          </button>
        )}
      </div>

      {live.currentTool && (
        <div className="home-agent-line home-agent-toolbox">
          <span className="home-agent-k">{live.currentTool.name}</span>
          <span className="home-agent-dim">
            {truncate(
              (() => {
                if (live.currentTool.args === undefined) return "…";
                if (typeof live.currentTool.args === "string") return live.currentTool.args;
                try { return JSON.stringify(live.currentTool.args); } catch { return "…"; }
              })(),
              180,
            )}
          </span>
        </div>
      )}

      {(live.streamText || live.lastMessage) && (
        <div className="home-agent-line home-agent-msg">
          {truncate(live.streamText || live.lastMessage || "", 240)}
        </div>
      )}

      {live.subagents.length > 0 && (
        <div className="home-agent-line home-agent-dim">
          ⛏ {live.subagents.filter((a) => a.status === "running").length} subagent(s) working
        </div>
      )}

      <div className="home-agent-stats">
        <span title="Input tokens today">
          ▲{fmtTok(totals?.total_input)} <i>in</i>
        </span>
        <span title="Output tokens today">
          ▼{fmtTok(totals?.total_output)} <i>out</i>
        </span>
        <span title="Estimated cost today">
          {fmtCost(totals?.total_estimated_cost)} <i>est</i>
        </span>
        <span title="Sessions today">
          {totals?.total_sessions ?? "—"} <i>ses</i>
        </span>
      </div>

      {live.toolHistory.length > 0 && (
        <div className="home-agent-history">
          {live.toolHistory.slice(0, 4).map((t, i) => (
            <span key={`${t.name}-${t.startedAt}-${i}`} className="home-agent-hist">
              <span className={t.status === "complete" ? "ok" : "bad"}>
                {t.status === "complete" ? "✓" : "✗"}
              </span>
              {t.name}
              {t.duration !== undefined && <i>{t.duration.toFixed(0)}s</i>}
            </span>
          ))}
        </div>
      )}

      {!live.live && (
        <div className="home-agent-dim">polling mode · no live channel</div>
      )}
    </div>
  );
}
