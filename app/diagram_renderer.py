import tempfile
import importlib
from pathlib import Path
from typing import Dict, Any, List, Set, Optional

from diagrams import Diagram, Cluster, Edge
from diagrams.generic.blank import Blank


def load_node_class(node_class_path: str):
    """Import a diagrams node class like diagrams.aws.compute.ECS"""
    try:
        module_path, class_name = node_class_path.rsplit(".", 1)
        module = importlib.import_module(module_path)
        return getattr(module, class_name)
    except Exception:
        return Blank


def build_node(node_spec: Dict[str, Any], node_registry: Dict[str, Any]):
    """
    Create node once. Node is placed into whatever Cluster context is active.
    """
    nid = node_spec["id"]
    if nid in node_registry:
        return node_registry[nid]

    label = node_spec.get("label", nid)
    NodeCls = load_node_class(
        node_spec.get("node_class", "diagrams.generic.blank.Blank")
    )
    node_registry[nid] = NodeCls(label)
    return node_registry[nid]


def merge_dict(
    base: Dict[str, Any], override: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    out = dict(base or {})
    if override:
        out.update(override)
    return out


def collect_cluster_node_ids(clusters: List[Dict[str, Any]]) -> Set[str]:
    """Collect all node_ids referenced in clusters recursively."""
    ids: Set[str] = set()

    def _walk(items: List[Dict[str, Any]]):
        for c in items:
            ids.update(c.get("node_ids", []))
            _walk(c.get("clusters", []))

    _walk(clusters or [])
    return ids


def build_clusters(
    clusters: List[Dict[str, Any]],
    nodes_by_id: Dict[str, Dict[str, Any]],
    node_registry: Dict[str, Any],
):
    """
    IMPORTANT: Nodes must be instantiated inside Cluster context to appear within it.
    """
    for c in clusters:
        name = c.get("name", "Cluster")
        node_ids = c.get("node_ids", [])
        nested = c.get("clusters", [])
        c_graph_attr = c.get("graph_attr", {})

        with Cluster(name, graph_attr=c_graph_attr):
            for nid in node_ids:
                if nid in nodes_by_id:
                    build_node(nodes_by_id[nid], node_registry)
            if nested:
                build_clusters(nested, nodes_by_id, node_registry)


def render_diagram_png(spec: Dict[str, Any]) -> bytes:
    """
    Render a diagram from JSON spec and return PNG bytes.
    """
    graph = spec.get("graph", {})
    defaults = spec.get("defaults", {})

    title = graph.get("title", "Diagram")
    direction = graph.get("direction", "LR")
    curvestyle = graph.get("curvestyle", "ortho")

    graph_attr = graph.get("graph_attr", {})
    node_attr = graph.get("node_attr", {})
    edge_attr = graph.get("edge_attr", {})

    default_edge_attrs = defaults.get("edge_attributes", {})

    nodes_spec = spec.get("nodes", [])
    edges_spec = spec.get("edges", [])
    clusters_spec = spec.get("clusters", [])

    nodes_by_id = {n["id"]: n for n in nodes_spec}
    clustered_node_ids = collect_cluster_node_ids(clusters_spec)
    node_registry: Dict[str, Any] = {}

    # diagrams writes to file => render to temp dir and read PNG back
    with tempfile.TemporaryDirectory() as td:
        out_base = str(Path(td) / "diagram_out")

        with Diagram(
            title,
            filename=out_base,
            outformat="png",
            show=False,
            direction=direction,
            graph_attr=graph_attr,
            node_attr=node_attr,
            edge_attr=edge_attr,
            curvestyle=curvestyle,
        ):
            # 1) clusters first (nodes instantiated inside cluster context)
            if clusters_spec:
                build_clusters(clusters_spec, nodes_by_id, node_registry)

            # 2) nodes not in clusters
            for nid, node_spec in nodes_by_id.items():
                if nid not in clustered_node_ids:
                    build_node(node_spec, node_registry)

            # 3) edges
            for e in edges_spec:
                src = e.get("from")
                dst = e.get("to")
                per_edge_attrs = e.get("attributes", {})

                if not src or not dst:
                    continue
                if src not in node_registry or dst not in node_registry:
                    continue

                attrs = merge_dict(default_edge_attrs, per_edge_attrs)
                node_registry[src] >> Edge(**attrs) >> node_registry[dst]

        png_path = Path(out_base + ".png")
        return png_path.read_bytes()
