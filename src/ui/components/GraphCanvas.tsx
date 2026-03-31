"use client";

import { useEffect, useRef, useCallback } from "react";
import type { GraphData, GraphNode, GraphEdge } from "@/lib/graph-queries";

// D3 is loaded dynamically to avoid SSR issues
type D3Selection = unknown;

interface Props {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  selectedNodeId: string | null;
}

const NODE_COLORS: Record<string, string> = {
  User:     "var(--node-user)",
  Repo:     "var(--node-repo)",
  Language: "var(--node-language)",
  Topic:    "var(--node-topic)",
};

const NODE_RADIUS: Record<string, number> = {
  User:     10,
  Repo:     8,
  Language: 6,
  Topic:    5,
};

export default function GraphCanvas({ data, onNodeClick, selectedNodeId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<unknown>(null);

  const render = useCallback(async () => {
    if (!svgRef.current || data.nodes.length === 0) return;

    // Dynamically import d3 to avoid SSR
    const d3 = await import("d3");

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // ── Defs: arrowhead marker ───────────────────────────────────
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#3a3a55");

    // Glow filter for selected node
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // ── Zoom / pan ────────────────────────────────────────────────
    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as D3Selection);

    // ── Clone nodes/links for mutation by simulation ──────────────
    interface SimNode extends GraphNode {
      x?: number;
      y?: number;
      fx?: number | null;
      fy?: number | null;
    }
    interface SimEdge {
      source: SimNode | string;
      target: SimNode | string;
      type: string;
      weight?: number;
    }

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimEdge[] = data.edges
      .map((e) => ({
        ...e,
        source: nodeById.get(e.source) ?? e.source,
        target: nodeById.get(e.target) ?? e.target,
      }))
      .filter((e) => e.source && e.target);

    // ── Force simulation ─────────────────────────────────────────
    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimEdge>(links)
        .id((d) => d.id)
        .distance((d) => {
          const t = (d as SimEdge & { source: SimNode }).source.label === "User" ? 120 : 80;
          return t;
        })
        .strength(0.5)
      )
      .force("charge", d3.forceManyBody().strength(-300).distanceMax(400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => (NODE_RADIUS[d.label] ?? 8) + 6));

    simulationRef.current = simulation;

    // ── Edges ──────────────────────────────────────────────────────
    const EDGE_COLOR: Record<string, string> = {
      FOLLOWS:        "#3a3a60",
      OWNS:           "#4a3a70",
      CONTRIBUTED_TO: "#3a4a60",
      STARRED:        "#4a4a30",
      USES_LANGUAGE:  "#2a4a4a",
      HAS_TOPIC:      "#4a3a30",
    };

    const link = g.append("g").attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => EDGE_COLOR[(d as SimEdge).type] ?? "#2a2a40")
      .attr("stroke-width", 1.2)
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", "url(#arrow)");

    // ── Nodes ──────────────────────────────────────────────────────
    const node = g.append("g").attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "node-group")
      .style("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as D3Selection
      )
      .on("click", (_event, d) => {
        onNodeClick(d as GraphNode);
      });

    // Circle
    node.append("circle")
      .attr("r", (d) => NODE_RADIUS[d.label] ?? 8)
      .attr("fill", (d) => NODE_COLORS[d.label] ?? "#888")
      .attr("fill-opacity", 0.85)
      .attr("stroke", (d) => d.id === selectedNodeId ? "#fff" : NODE_COLORS[d.label] ?? "#888")
      .attr("stroke-width", (d) => d.id === selectedNodeId ? 2.5 : 1)
      .attr("filter", (d) => d.id === selectedNodeId ? "url(#glow)" : "none");

    // Avatar image for User nodes
    node.filter((d) => d.label === "User" && !!d.avatarUrl)
      .append("clipPath")
      .attr("id", (d) => `clip-${d.id.replace(/[^a-z0-9]/gi, "")}`)
      .append("circle")
      .attr("r", (d) => NODE_RADIUS[d.label] ?? 8);

    node.filter((d) => d.label === "User" && !!d.avatarUrl)
      .append("image")
      .attr("href", (d) => d.avatarUrl!)
      .attr("x", (d) => -(NODE_RADIUS[d.label] ?? 8))
      .attr("y", (d) => -(NODE_RADIUS[d.label] ?? 8))
      .attr("width", (d) => (NODE_RADIUS[d.label] ?? 8) * 2)
      .attr("height", (d) => (NODE_RADIUS[d.label] ?? 8) * 2)
      .attr("clip-path", (d) => `url(#clip-${d.id.replace(/[^a-z0-9]/gi, "")})`)
      .attr("preserveAspectRatio", "xMidYMid slice");

    // Label
    node.append("text")
      .text((d) => d.login ?? d.name ?? "")
      .attr("dy", (d) => (NODE_RADIUS[d.label] ?? 8) + 12)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--text-dim)")
      .attr("font-size", 9)
      .attr("font-family", "var(--font-mono)")
      .attr("pointer-events", "none");

    // ── Legend ─────────────────────────────────────────────────────
    const legend = svg.append("g").attr("transform", "translate(16, 16)");
    const legendItems = [
      { label: "User",     color: NODE_COLORS.User },
      { label: "Repo",     color: NODE_COLORS.Repo },
      { label: "Language", color: NODE_COLORS.Language },
      { label: "Topic",    color: NODE_COLORS.Topic },
    ];
    legendItems.forEach(({ label, color }, i) => {
      const row = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
      row.append("circle").attr("r", 5).attr("cx", 5).attr("cy", 5).attr("fill", color).attr("fill-opacity", 0.85);
      row.append("text").text(label).attr("x", 16).attr("y", 9).attr("fill", "var(--text-dim)").attr("font-size", 10).attr("font-family", "var(--font-mono)");
    });

    // ── Tick ─────────────────────────────────────────────────────
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    // Auto-zoom to fit after settling
    setTimeout(() => {
      const bounds = g.node()!.getBBox();
      const padding = 60;
      const scale = Math.min(
        (width - padding * 2) / bounds.width,
        (height - padding * 2) / bounds.height,
        1.2
      );
      const tx = width / 2 - scale * (bounds.x + bounds.width / 2);
      const ty = height / 2 - scale * (bounds.y + bounds.height / 2);
      svg.transition().duration(800).call(
        zoom.transform as D3Selection,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
    }, 1500);
  }, [data, selectedNodeId, onNodeClick]);

  useEffect(() => {
    render();
    return () => {
      // Stop simulation on unmount
      if (simulationRef.current) {
        (simulationRef.current as { stop: () => void }).stop();
      }
    };
  }, [render]);

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
