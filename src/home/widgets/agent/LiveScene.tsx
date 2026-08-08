import { useEffect, useRef, useState } from "react";
import { argPreview, type AgentLiveState } from "./agentLive";

/** One "scene" of the live agent feed — the thing happening right now. */
export interface SceneItem {
  /** Stable identity: a new key re-runs the slide-up entrance animation. */
  key: string;
  kind: "tool" | "message" | "idle";
  title: string;
  body: string;
  meta?: string;
  streaming?: boolean;
}

/** Derive the current scene from live state. Message streaming keeps one
 *  stable identity for the whole stream (no re-animation per delta); a new
 *  tool call or a new message gets a fresh key and animates in. */
export function useScene(live: AgentLiveState): SceneItem {
  const [scene, setScene] = useState<SceneItem>(() => sceneFrom(live));
  const wasStreaming = useRef(false);

  useEffect(() => {
    const streaming = live.streamText.trim().length > 0;
    const prevStreaming = wasStreaming.current;
    wasStreaming.current = streaming;

    if (streaming && !prevStreaming) {
      setScene({
        key: `msg-${Date.now()}`,
        kind: "message",
        title: "message",
        body: live.streamText,
        meta: "streaming",
        streaming: true,
      });
    } else if (streaming) {
      setScene((s) => (s.streaming ? { ...s, body: live.streamText } : s));
    } else if (live.currentTool) {
      const key = `tool-${live.currentTool.name}-${live.currentTool.startedAt}`;
      const body = argPreview(live.currentTool.args, 500) ?? "";
      setScene((s) =>
        s.key === key ? { ...s, body } : {
          key, kind: "tool" as const,
          title: live.currentTool!.name,
          body,
          meta: "running",
        },
      );
    } else if (live.lastMessage) {
      const msg = live.lastMessage;
      setScene((s) =>
        s.kind === "message" && !s.streaming && s.body === msg
          ? s
          : { key: `done-${Date.now()}`, kind: "message", title: "message", body: msg, meta: "complete" },
      );
    } else {
      setScene((s) =>
        s.kind === "idle"
          ? s
          : { key: "idle", kind: "idle", title: "idle", body: "the agent is resting — new activity will appear here" },
      );
    }
  }, [live.streamText, live.currentTool, live.lastMessage]);

  return scene;
}

function sceneFrom(live: AgentLiveState): SceneItem {
  if (live.streamText.trim()) {
    return {
      key: `msg-${Date.now()}`, kind: "message", title: "message",
      body: live.streamText, meta: "streaming", streaming: true,
    };
  }
  if (live.currentTool) {
    return {
      key: `tool-${live.currentTool.name}-${live.currentTool.startedAt}`,
      kind: "tool", title: live.currentTool.name,
      body: argPreview(live.currentTool.args, 500) ?? "",
      meta: "running",
    };
  }
  if (live.lastMessage) {
    return { key: "done", kind: "message", title: "message", body: live.lastMessage, meta: "complete" };
  }
  return { key: "idle", kind: "idle", title: "idle", body: "the agent is resting — new activity will appear here" };
}

function SceneBody({ scene }: { scene: SceneItem }) {
  if (scene.kind === "tool") {
    return (
      <div className="home-scene-tool">
        <span className="home-scene-title">{scene.title}</span>
        <span className="home-scene-meta">{scene.meta}</span>
        {scene.body && <pre className="home-scene-args">{scene.body}</pre>}
      </div>
    );
  }
  if (scene.kind === "message") {
    return (
      <div className="home-scene-msg">
        {scene.body}
        {scene.streaming && <span className="home-scene-caret" aria-hidden="true" />}
      </div>
    );
  }
  return <div className="home-scene-idle">{scene.body}</div>;
}

/** The animated scene: when the identity changes, the outgoing content
 *  slides up while fading, and the incoming content rises from below with a
 *  blur that dissolves as it settles. */
export function LiveScene({ scene }: { scene: SceneItem }) {
  const [current, setCurrent] = useState<SceneItem>(scene);
  const [leaving, setLeaving] = useState<SceneItem | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (scene.key === current.key) return;
    setLeaving(current);
    setCurrent(scene);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeaving(null), 460);
  }, [scene.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return (
    <div className="home-scene">
      {leaving && (
        <div className="home-scene-item leaving" aria-hidden="true">
          <SceneBody scene={leaving} />
        </div>
      )}
      <div className="home-scene-item" key={current.key}>
        <SceneBody scene={current} />
      </div>
    </div>
  );
}
