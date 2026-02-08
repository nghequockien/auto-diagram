#!/usr/bin/env python3
import json
import os
import sys
import importlib
from typing import Dict, Any, List, Set, Optional

from diagrams import Diagram, Cluster, Edge
from diagrams.generic.blank import Blank


def load_node_class(node_class_path: str):
    """
    Dynamically import a diagrams node class, e.g.:
      diagrams.aws.compute.ECS
      diagrams.azure.compute.VM
      diagrams.generic.user.User
    """
    try:
        module_path, class_name = node_class_path.rsplit(".", 1)
        module = importlib.import_module(module_path)
        return getattr(module, class_name)
    except Exception as e:
        print(f"[WARN] Could not load node_class '{node_class_path}'. Using Blank instead. Error: {e}")
        return Blank


def ensure_output_dir(filename: str):
    out_dir = os.path.dirname(filename)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)


def build_node(node_spec: Dict[str, Any], node_registry: Dict[str, Any]):
    """
    Create a node only once and store it in registry.
    IMPORTANT: Node must be created inside the intended Cluster context.
    """
    nid = node_spec["id"]
    if nid in node_registry:
        return node_registry[nid]

    label = node_spec.get("label", nid)
    node_class_path = node_spec.get("node_class", "diagrams.generic.blank.Blank")
    NodeCls = load_node_class(node_class_path)

    node_registry[nid] = NodeCls(label)
    return node_registry[nid]


def collect_cluster_node_ids(clusters: List[Dict[str, Any]]) -> Set[str]:
    """Collect all node_ids mentioned anywhere in cluster tree."""
    ids: Set[str] = set()

    def _walk(c_list: List[Dict[str, Any]]):
        for c in c_list:
            for nid in c.get("node_ids", []):
                ids.add(nid)
            nested = c.get("clusters", [])
            if nested:
                _walk(nested)

    _walk(clusters)
    return ids


def build_clusters(
    clusters: List[Dict[str, Any]],
    nodes_by_id: Dict[str, Dict[str, Any]],
    node_registry: Dict[str, Any],
):
    """
    Recursively create clusters and instantiate nodes INSIDE them.
    This is required for proper clustering with diagrams.
    """
    for c in clusters:
        name = c.get("name", "Cluster")
        node_ids = c.get("node_ids", [])
        nested = c.get("clusters", [])
        c_graph_attr = c.get("graph_attr", {})  # background color, style, etc.

        with Cluster(name, graph_attr=c_graph_attr):
            # Create nodes inside this cluster context
            for nid in node_ids:
                if nid not in nodes_by_id:
                    print(f"[WARN] node_id '{nid}' referenced in cluster '{name}' but not defined in nodes.")
                    continue
                build_node(nodes_by_id[nid], node_registry)

            # Recurse nested clusters
            if nested:
                build_clusters(nested, nodes_by_id, node_registry)


def merge_dict(base: Dict[str, Any], override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Shallow-merge two dicts."""
    out = dict(base or {})
    if override:
        out.update(override)
    return out


def main(json_path: str):
    with open(json_path, "r", encoding="utf-8") as f:
        spec = json.load(f)

    graph = spec.get("graph", {})
    defaults = spec.get("defaults", {})

    title = graph.get("title", "Architecture Diagram")
    filename = graph.get("filename", "output/diagram")
    outformat = graph.get("outformat", "png")
    direction = graph.get("direction", "LR")
    show = graph.get("show", False)
    curvestyle = graph.get("curvestyle", "ortho")

    graph_attr = graph.get("graph_attr", {})
    node_attr = graph.get("node_attr", {})
    edge_attr = graph.get("edge_attr", {})

    default_edge_attrs = defaults.get("edge_attributes", {})

    ensure_output_dir(filename)

    nodes_spec = spec.get("nodes", [])
    edges_spec = spec.get("edges", [])
    clusters_spec = spec.get("clusters", [])

    nodes_by_id: Dict[str, Dict[str, Any]] = {n["id"]: n for n in nodes_spec}
    node_registry: Dict[str, Any] = {}

    clustered_node_ids = collect_cluster_node_ids(clusters_spec)

    with Diagram(
        title,
        filename=filename,
        outformat=outformat,
        direction=direction,
        show=show,
        graph_attr=graph_attr,
        node_attr=node_attr,
        edge_attr=edge_attr,
        curvestyle=curvestyle,
    ):
        # 1) Create clusters and nodes inside them (for correct rendering)
        if clusters_spec:
            build_clusters(clusters_spec, nodes_by_id, node_registry)

        # 2) Create nodes not included in any cluster
        for nid, node_spec in nodes_by_id.items():
            if nid not in clustered_node_ids:
                build_node(node_spec, node_registry)

        # 3) Draw edges
        for e in edges_spec:
            src = e.get("from")
            dst = e.get("to")
            per_edge_attrs = e.get("attributes", {})

            if not src or not dst:
                print(f"[WARN] Edge missing 'from' or 'to': {e}")
                continue

            if src not in node_registry:
                print(f"[WARN] Edge from '{src}' but node not found. Skipping.")
                continue
            if dst not in node_registry:
                print(f"[WARN] Edge to '{dst}' but node not found. Skipping.")
                continue

            attrs = merge_dict(default_edge_attrs, per_edge_attrs)
            node_registry[src] >> Edge(**attrs) >> node_registry[dst]

    print(f"[OK] Diagram generated: {filename}.{outformat}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_diagram.py <architecture.json>")
        sys.exit(1)

    main(sys.argv[1])