"use client";

import { useState, useRef, useCallback } from "react";

interface Props {
  onSearch: (login: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }, [value, onSearch]);

  return (
    <div className="search-wrap">
      <div className="search-box">
        <span className="search-prefix mono dim">@</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="github username"
          className="search-input mono"
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="search-btn"
          onClick={handleSubmit}
          disabled={loading || !value.trim()}
        >
          {loading ? <span className="spinner" /> : <span>↵</span>}
        </button>
      </div>

      <style>{`
        .search-wrap {
          flex: 1;
          min-width: 0;
          max-width: 440px;
        }
        .search-box {
          display: flex;
          align-items: center;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .search-box:focus-within {
          border-color: var(--accent);
        }
        .search-prefix {
          padding: 0 10px;
          font-size: 14px;
          user-select: none;
        }
        .search-input {
          flex: 1;
          border: none;
          background: transparent;
          color: var(--text);
          font-size: 13px;
          padding: 8px 4px;
          outline: none;
          min-width: 0;
        }
        .search-input::placeholder { color: var(--text-dim); }
        .search-btn {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          color: var(--text-dim);
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-left: 1px solid var(--border);
          transition: all 0.15s;
        }
        .search-btn:hover:not(:disabled) {
          background: var(--accent);
          color: #fff;
        }
        .search-btn:disabled { opacity: 0.4; cursor: default; }
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
