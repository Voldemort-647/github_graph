"use client";

import { useState, useCallback } from "react";
import GraphCanvas from "@/ui/components/GraphCanvas";
import Sidebar from "@/ui/components/Sidebar";
import SearchBar from "@/ui/components/SearchBar";
import StatsBar from "@/ui/components/StatsBar";
import NodeDetail from "@/ui/components/NodeDetail";
import type { GraphData, GraphNode } from "@/lib/graph-queries";

export default function HomePage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLogin, setCurrentLogin] = useState<string>("");
  const [hops, setHops] = useState(1);

  const loadUser = useCallback(async (login: string, hopsOverride?: number) => {
    if (!login.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    const h = hopsOverride ?? hops;

    try {
      const res = await fetch(`/api/user/${encodeURIComponent(login.trim())}?hops=${h}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load graph");
      setGraphData(data as GraphData);
      setCurrentLogin(login.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, [hops]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    // If user node clicked, load their graph
    if (node.label === "User" && node.login && node.login !== currentLogin) {
      // Don't auto-navigate — let user choose via the detail panel
    }
  }, [currentLogin]);

  return (
    <div className="app-shell">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-logo">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="5"  cy="5"  r="3" fill="var(--node-user)" />
            <circle cx="15" cy="5"  r="3" fill="var(--node-repo)" />
            <circle cx="10" cy="15" r="3" fill="var(--node-language)" />
            <line x1="5" y1="5" x2="15" y2="5"  stroke="var(--border)" strokeWidth="1.5" />
            <line x1="5" y1="5" x2="10" y2="15" stroke="var(--border)" strokeWidth="1.5" />
            <line x1="15" y1="5" x2="10" y2="15" stroke="var(--border)" strokeWidth="1.5" />
          </svg>
          <span className="mono">graph<span style={{color:"var(--accent)"}}>.</span>explore</span>
        </div>

        <SearchBar onSearch={loadUser} loading={loading} />

        <div className="topbar-controls">
          <label className="hops-control">
            <span className="dim mono" style={{fontSize:11}}>HOPS</span>
            {[1, 2].map(n => (
              <button
                key={n}
                className={`hop-btn ${hops === n ? "active" : ""}`}
                onClick={() => {
                  setHops(n);
                  if (currentLogin) loadUser(currentLogin, n);
                }}
              >
                {n}
              </button>
            ))}
          </label>
        </div>
      </header>

      {/* ── Main canvas area ─────────────────────────────────────── */}
      <main className="canvas-area">
        {!graphData && !loading && (
          <EmptyState onSearch={loadUser} />
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="loader-ring" />
            <p className="mono dim" style={{fontSize:12,marginTop:16}}>QUERYING NEO4J…</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <span>⚠</span> {error}
          </div>
        )}

        {graphData && !loading && (
          <GraphCanvas
            data={graphData}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNode?.id ?? null}
          />
        )}

        {/* ── Stats overlay ──────────────────────────────────────── */}
        {graphData && (
          <StatsBar data={graphData} login={currentLogin} />
        )}
      </main>

      {/* ── Right sidebar: node detail ────────────────────────────── */}
      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onNavigate={(login) => loadUser(login)}
        />
      )}

      <style>{`
        .app-shell {
          display: grid;
          grid-template-rows: 52px 1fr;
          grid-template-columns: 1fr;
          height: 100vh;
          overflow: hidden;
        }

        .topbar {
          grid-row: 1;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 20px;
          background: var(--bg2);
          border-bottom: 1px solid var(--border);
          z-index: 10;
        }

        .topbar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          color: var(--text);
          flex-shrink: 0;
        }

        .topbar-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .hops-control {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .hop-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-dim);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 12px;
          transition: all 0.15s;
        }
        .hop-btn:hover { border-color: var(--accent); color: var(--text); }
        .hop-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

        .canvas-area {
          grid-row: 2;
          position: relative;
          overflow: hidden;
          background: var(--bg);
        }

        .loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 5;
        }

        .loader-ring {
          width: 36px;
          height: 36px;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .error-banner {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: color-mix(in srgb, var(--accent2) 15%, var(--bg2));
          border: 1px solid var(--accent2);
          color: var(--accent2);
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 13px;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

function EmptyState({ onSearch }: { onSearch: (login: string) => void }) {
  const seeds = ["torvalds", "gaearon", "tj", "sindresorhus", "addyosmani"];
  return (
    <div className="empty-state">
      <div className="empty-glyph">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="10" fill="var(--node-user)" opacity="0.8" />
          <circle cx="100" cy="20" r="10" fill="var(--node-repo)" opacity="0.8" />
          <circle cx="60" cy="100" r="10" fill="var(--node-language)" opacity="0.8" />
          <circle cx="20" cy="60" r="6"  fill="var(--node-user)" opacity="0.4" />
          <circle cx="100" cy="60" r="6" fill="var(--node-repo)" opacity="0.4" />
          <line x1="20" y1="20" x2="100" y2="20" stroke="var(--border)" strokeWidth="1.5" />
          <line x1="20" y1="20" x2="60"  y2="100" stroke="var(--border)" strokeWidth="1.5" />
          <line x1="100" y1="20" x2="60" y2="100" stroke="var(--border)" strokeWidth="1.5" />
          <line x1="20" y1="20" x2="20"  y2="60"  stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="100" y1="20" x2="100" y2="60" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="20" y1="60" x2="60"  y2="100" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="100" y1="60" x2="60" y2="100" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
        </svg>
      </div>
      <h2>GitHub Graph Explorer</h2>
      <p className="dim">Search a GitHub username to explore their network,<br/>repositories, and contribution graph stored in Neo4j.</p>
      <div className="seed-chips">
        <span className="dim mono" style={{fontSize:11}}>TRY →</span>
        {seeds.map(s => (
          <button key={s} className="seed-chip mono" onClick={() => onSearch(s)}>{s}</button>
        ))}
      </div>

      <style>{`
        .empty-state {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          text-align: center;
          padding: 40px;
        }
        .empty-glyph svg {
          width: 100px;
          height: 100px;
          margin-bottom: 8px;
        }
        .empty-state h2 {
          font-size: 22px;
          font-weight: 700;
          font-family: var(--font-mono);
          letter-spacing: -0.5px;
        }
        .empty-state p { font-size: 14px; line-height: 1.7; }
        .seed-chips {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 8px;
        }
        .seed-chip {
          padding: 5px 14px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: transparent;
          color: var(--text-dim);
          cursor: pointer;
          font-size: 12px;
          transition: all 0.15s;
        }
        .seed-chip:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 10%, transparent);
        }
      `}</style>
    </div>
  );
}
