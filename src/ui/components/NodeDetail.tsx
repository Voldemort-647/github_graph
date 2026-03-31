"use client";

import { useEffect, useState } from "react";
import type { GraphNode } from "@/lib/graph-queries";

interface RepoDetail {
  repo: { fullName: string; name: string; description: string; stars: number; forks: number; htmlUrl: string; archived: boolean; language: string };
  owner: { login: string; name: string; avatarUrl: string } | null;
  contributors: Array<{ login: string; avatarUrl: string; commits: number }>;
  languages: string[];
  topics: string[];
}

interface Props {
  node: GraphNode;
  onClose: () => void;
  onNavigate: (login: string) => void;
}

export default function NodeDetail({ node, onClose, onNavigate }: Props) {
  const [repoDetail, setRepoDetail] = useState<RepoDetail | null>(null);
  const [loadingRepo, setLoadingRepo] = useState(false);

  useEffect(() => {
    setRepoDetail(null);
    if (node.label === "Repo" && node.name) {
      // Extract owner/name from id like "repo:owner/name"
      const fullName = node.id.replace(/^repo:/, "");
      const [owner, name] = fullName.split("/");
      if (owner && name) {
        setLoadingRepo(true);
        fetch(`/api/repo/${owner}/${name}`)
          .then((r) => r.json())
          .then((d) => setRepoDetail(d))
          .catch(() => {})
          .finally(() => setLoadingRepo(false));
      }
    }
  }, [node]);

  const colorClass = node.label.toLowerCase();

  return (
    <aside className="node-detail">
      {/* Header */}
      <div className="nd-header">
        <span className={`tag tag-${colorClass}`}>{node.label}</span>
        <button className="nd-close" onClick={onClose}>✕</button>
      </div>

      {/* Avatar + name */}
      <div className="nd-identity">
        {node.avatarUrl ? (
          <img src={node.avatarUrl} alt={node.login ?? node.name} className="nd-avatar" />
        ) : (
          <div className="nd-avatar-placeholder" style={{ background: `color-mix(in srgb, var(--node-${colorClass}) 30%, transparent)` }}>
            <span>{(node.name ?? "?")[0].toUpperCase()}</span>
          </div>
        )}
        <div>
          <div className="nd-name">{node.name ?? node.login ?? node.id}</div>
          {node.login && <div className="nd-login mono dim">@{node.login}</div>}
        </div>
      </div>

      <hr className="nd-divider" />

      {/* User details */}
      {node.label === "User" && (
        <div className="nd-body">
          {node.htmlUrl && (
            <a href={node.htmlUrl} target="_blank" rel="noopener noreferrer" className="nd-link">
              View on GitHub →
            </a>
          )}
          {node.login && node.login && (
            <button
              className="nd-nav-btn"
              onClick={() => onNavigate(node.login!)}
            >
              Explore this user's graph →
            </button>
          )}
        </div>
      )}

      {/* Repo details */}
      {node.label === "Repo" && (
        <div className="nd-body">
          {loadingRepo && <p className="dim mono" style={{fontSize:11}}>Loading…</p>}
          {repoDetail && (
            <>
              {repoDetail.repo.description && (
                <p className="nd-desc">{repoDetail.repo.description}</p>
              )}
              <div className="nd-stats-row">
                <span className="nd-stat">⭐ {repoDetail.repo.stars.toLocaleString()}</span>
                <span className="nd-stat">🍴 {repoDetail.repo.forks.toLocaleString()}</span>
                {repoDetail.repo.language && (
                  <span className="nd-stat">
                    <span className="dot" style={{ background: "var(--node-language)" }} />
                    {repoDetail.repo.language}
                  </span>
                )}
              </div>
              {repoDetail.topics.length > 0 && (
                <div className="nd-chips">
                  {repoDetail.topics.map((t) => (
                    <span key={t} className="tag tag-topic">{t}</span>
                  ))}
                </div>
              )}
              {repoDetail.contributors.length > 0 && (
                <div className="nd-section">
                  <div className="nd-section-title mono dim">TOP CONTRIBUTORS</div>
                  <div className="nd-contributors">
                    {repoDetail.contributors.slice(0, 8).map((c) => (
                      <button
                        key={c.login}
                        className="nd-contributor"
                        title={`${c.login} — ${c.commits} commits`}
                        onClick={() => onNavigate(c.login)}
                      >
                        <img src={c.avatarUrl} alt={c.login} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {repoDetail.owner && (
                <button className="nd-nav-btn" onClick={() => onNavigate(repoDetail.owner!.login)}>
                  Explore owner @{repoDetail.owner.login} →
                </button>
              )}
              <a href={repoDetail.repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="nd-link">
                View on GitHub →
              </a>
            </>
          )}
        </div>
      )}

      {/* Language details */}
      {node.label === "Language" && (
        <div className="nd-body">
          <p className="dim" style={{ fontSize: 13 }}>
            Programming language used across repos in this graph.
          </p>
        </div>
      )}

      {/* Topic details */}
      {node.label === "Topic" && (
        <div className="nd-body">
          <p className="dim" style={{ fontSize: 13 }}>
            Repository topic tag.
          </p>
          <a
            href={`https://github.com/topics/${node.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="nd-link"
          >
            Browse #{node.name} on GitHub →
          </a>
        </div>
      )}

      <style>{`
        .node-detail {
          position: absolute;
          top: 0;
          right: 0;
          width: 280px;
          height: 100%;
          background: var(--bg2);
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow-y: auto;
          z-index: 10;
          animation: slideIn 0.18s ease;
        }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } }

        .nd-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 10px;
          flex-shrink: 0;
        }
        .nd-close {
          background: none;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.1s;
        }
        .nd-close:hover { background: var(--border); color: var(--text); }

        .nd-identity {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 16px 14px;
          flex-shrink: 0;
        }
        .nd-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--border);
          flex-shrink: 0;
        }
        .nd-avatar-placeholder {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          flex-shrink: 0;
          border: 2px solid var(--border);
        }
        .nd-name {
          font-size: 15px;
          font-weight: 600;
          line-height: 1.3;
        }
        .nd-login { font-size: 12px; margin-top: 2px; }
        .nd-divider {
          border: none;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .nd-body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .nd-desc {
          font-size: 12px;
          color: var(--text-dim);
          line-height: 1.6;
        }
        .nd-stats-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .nd-stat {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-dim);
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
        }
        .nd-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .nd-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .nd-section-title {
          font-size: 10px;
          letter-spacing: 0.08em;
        }
        .nd-contributors {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .nd-contributor {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid var(--border);
          padding: 0;
          background: none;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .nd-contributor:hover { border-color: var(--accent); }
        .nd-contributor img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .nd-link {
          color: var(--accent);
          font-size: 12px;
          text-decoration: none;
          font-family: var(--font-mono);
        }
        .nd-link:hover { text-decoration: underline; }
        .nd-nav-btn {
          background: color-mix(in srgb, var(--accent) 15%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
          color: var(--accent);
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-family: var(--font-mono);
          text-align: left;
          transition: all 0.15s;
        }
        .nd-nav-btn:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }
      `}</style>
    </aside>
  );
}
