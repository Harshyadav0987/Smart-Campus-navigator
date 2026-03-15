import { useState, useEffect } from "react"
import { MapContainer, ImageOverlay, CircleMarker, Polyline, Tooltip, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "./AdminMap.css"

const MAP_WIDTH = 4642
const MAP_HEIGHT = 3924
const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]]

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    }
  })
  return null
}

export default function AdminMap() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [mode, setMode] = useState("node")
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  useEffect(() => {
    fetch("http://localhost:5000/api/nodes").then(r => r.json()).then(setNodes)
    fetch("http://localhost:5000/api/edges").then(r => r.json()).then(setEdges)
  }, [])

  async function handleMapClick(latlng) {
    if (mode !== "node") return

    const label = prompt("Enter room ID (e.g. J014, corridor_1):")
    if (!label) return

    const type = prompt("Type? room / corridor / stairs / washroom / lab / garden / faculty:")

    const newNode = {
      id: label,
      label,
      type: type || "room",
      floor: 0,
      x: Math.round(latlng.lng),
      y: Math.round(latlng.lat),
    }

    const res = await fetch("http://localhost:5000/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newNode),
    })
    const saved = await res.json()
    setNodes(prev => [...prev, saved])
  }

  async function handleNodeClick(node) {
    // Delete mode
    if (mode === "delete") {
      if (!window.confirm(`Delete node "${node.label}"?`)) return
      await fetch(`http://localhost:5000/api/nodes?id=${encodeURIComponent(node.id)}`, { method: "DELETE" })
      setNodes(prev => prev.filter(n => n.id !== node.id))
      setEdges(prev => prev.filter(e => e.from !== node.id && e.to !== node.id))
      return
    }

    if (mode !== "edge") return

    if (!selectedNode) {
      setSelectedNode(node)
    //   alert(`✅ Selected: ${node.label}\nNow click the second node to connect.`)
    } else {
      const dx = node.x - selectedNode.x
      const dy = node.y - selectedNode.y
      const weight = Math.round(Math.sqrt(dx * dx + dy * dy))

      const newEdge = {
        from: selectedNode.id,
        to: node.id,
        weight,
        isStair: selectedNode.type === "stairs" || node.type === "stairs",
      }

      const res = await fetch("http://localhost:5000/api/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEdge),
      })
      const saved = await res.json()
      setEdges(prev => [...prev, saved])
      setSelectedNode(null)
    }
  }

  // Get node color based on mode and type
  function getNodeColor(node) {
    if (selectedNode?.id === node.id) return "#e74c3c"
    if (mode === "delete") return "#e74c3c"
    const colors = {
      room: "#2ecc71",
      corridor: "#3498db",
      stairs: "#f39c12",
      washroom: "#9b59b6",
      lab: "#1abc9c",
      garden: "#27ae60",
      faculty: "#e84393",
    }
    return colors[node.type] || "#2ecc71"
  }

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div className="admin-title">
          <span>🛠</span>
          <span>MITS Indoor Nav — Admin</span>
          <span className="admin-pill">Graph editor</span>
        </div>

        <button
          onClick={() => {
            setMode("node")
            setSelectedNode(null)
          }}
          className={`admin-button primary ${mode === "node" ? "active" : ""}`}
        >
          <span>🟢</span>
          Place node
        </button>

        <button
          onClick={() => {
            setMode("edge")
            setSelectedNode(null)
          }}
          className={`admin-button edge ${mode === "edge" ? "active" : ""}`}
        >
          <span>🔗</span>
          Connect edge
        </button>

        <button
          onClick={() => {
            setMode("delete")
            setSelectedNode(null)
          }}
          className={`admin-button delete ${mode === "delete" ? "active" : ""}`}
        >
          <span>🗑️</span>
          Delete node
        </button>

        <div className="admin-stats">
          <span>
            Nodes: <b>{nodes.length}</b>
          </span>
          <span>
            Edges: <b>{edges.length}</b>
          </span>
          {selectedNode && (
            <span className="admin-selected">Selected: {selectedNode.label}</span>
          )}
        </div>

        <div className="admin-mode-chip">
          <span className="icon">
            {mode === "node" ? "📍" : mode === "edge" ? "🧵" : "⚠️"}
          </span>
          Mode: {mode.toUpperCase()}
        </div>
      </div>

      <div className="admin-map-wrap">
        <MapContainer
          crs={L.CRS.Simple}
          bounds={bounds}
          style={{ height: "calc(100vh - 54px)", width: "100%" }}
          maxZoom={2}
          minZoom={-3}
          zoom={-2}
        >
          <ImageOverlay url="/ground_floor.png" bounds={bounds} />
          <ClickHandler onMapClick={handleMapClick} />

          {edges.map((edge, i) => {
            const from = nodes.find(n => n.id === edge.from)
            const to = nodes.find(n => n.id === edge.to)
            if (!from || !to) return null
            return (
              <Polyline
                key={i}
                positions={[[from.y, from.x], [to.y, to.x]]}
                color={edge.isStair ? "#f39c12" : "#3498db"}
                weight={2}
              />
            )
          })}

          {nodes.map((node, i) => (
            <CircleMarker
              key={i}
              center={[node.y, node.x]}
              radius={6}
              pathOptions={{
                color: getNodeColor(node),
                fillColor: getNodeColor(node),
                fillOpacity: 1
              }}
              eventHandlers={{ click: () => handleNodeClick(node) }}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>
                {node.label}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}