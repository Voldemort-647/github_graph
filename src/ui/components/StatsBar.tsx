"use client";

import type { GraphData } from "@/lib/graph-queries";

interface Props {
  data: GraphData;
  login: string;
}

export default function StatsBar({ data, login }: Props) {
  const counts = data.nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.label] = (acc[n.label] ?? 0) + 1;
    return acc;
  }, {});

  const edgeCounts = data.edges.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="stats-bar">
      <span className="stat-login mono">@{login}</span>
      <span className="stat-sep">·</span>
      <span className="stat-item">
        <span className="dot" style={{ background: "var(--node-user)" }} />
        <span className="mono">{counts.User ?? 0}</span>
        <span className="dim">users</span>
      </span>
      <span className="stat-item">
        <span className="dot" style={{ background: "var(--node-repo)" }} />
        <span className="mono">{counts.Repo ?? 0}</span>
        <span className="dim">repos</span>
      </span>
      {counts.Language > 0 && (
        <span className="stat-item">
          <span className="dot" style={{ background: "var(--node-language)" }} />
          <span className="mono">{counts.Language}</span>
          <span className="dim">langs</span>
        </span>
      )}
      <span className="stat-sep">·</span>
      <span className="stat-item">
        <span className="mono">{data.edges.length}</span>
        <span className="dim">edges</span>
      </span>
      {Object.entries(edgeCounts).slice(0, 3).map(([type, count]) => (
        <span key={type} className="stat-edge-chip">
          <span className="dim">{type.toLowerCase().replace("_", " ")}</span>
          <span className="mono">{count}</span>
        </span>
      ))}

      <style>{`
        .stats-bar {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 11px;
          white-space: nowrap;
          backdrop-filter: blur(8px);
          pointer-events: none;
        }
        .stat-login {
          color: var(--accent);
          font-size: 12px;
        }
        .stat-sep { color: var(--border); }
        .stat-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .stat-edge-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 1px 8px;
          background: var(--bg3);
          border-radius: 20px;
          font-size: 10px;
        }
      `}</style>
    </div>
  );
}
