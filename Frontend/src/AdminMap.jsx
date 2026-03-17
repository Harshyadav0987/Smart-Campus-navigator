import { useState, useEffect } from "react"
import { MapContainer, ImageOverlay, CircleMarker, Polyline, Tooltip, useMapEvents } from "react-leaflet"
import L from "leaflet"

const MAP_WIDTH = 4642
const MAP_HEIGHT = 3924
const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]]

function ClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng) } })
  return null
}

const FLOORS = [
  { label: "Ground Floor", value: 0 },
  { label: "1st Floor A",  value: 1 },
  { label: "1st Floor B",  value: 2 },
  { label: "2nd Floor",    value: 3 },
]

const FLOOR_MAPS = {
  0: "/ground_floor.png",
  1: "/first_floor_a.png",
  2: "/first_floor_b.png",
  3: "/second_floor.png",
}

export default function AdminMap() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [mode, setMode] = useState("node")
  const [selectedNode, setSelectedNode] = useState(null)
  const [floor, setFloor] = useState(0)

  const currentNodes = nodes.filter(n => n.floor === floor)

  useEffect(() => {
    fetch("http://localhost:5000/api/nodes").then(r => r.json()).then(setNodes)
    fetch("http://localhost:5000/api/edges").then(r => r.json()).then(setEdges)
  }, [])

  async function handleMapClick(latlng) {
    if (mode !== "node") return
    const label = prompt("Enter room ID:")
    if (!label) return
    const type = prompt("Type? room / corridor / stairs / washroom / lab / garden / faculty:")

    const newNode = {
      id: label, label,
      type: type || "room",
      floor,
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
    } else {
      const dx = node.x - selectedNode.x
      const dy = node.y - selectedNode.y
      const weight = Math.round(Math.sqrt(dx * dx + dy * dy))
      const isStair = selectedNode.type === "stairs" || node.type === "stairs"
      const finalWeight = selectedNode.floor !== node.floor ? 200 : weight

      const newEdge = {
        from: selectedNode.id,
        to: node.id,
        weight: finalWeight,
        isStair,
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

  const visibleEdges = edges.filter(edge => {
    const from = nodes.find(n => n.id === edge.from)
    const to = nodes.find(n => n.id === edge.to)
    if (!from || !to) return false
    return from.floor === floor || to.floor === floor
  })

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
    <div>
      <div style={{
        padding: "10px 20px",
        background: "#1a1a2e",
        color: "white",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }}>
        <b>🏫 MITS Admin Tool</b>

        {/* Floor switcher */}
        <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 4 }}>
          {FLOORS.map(f => (
            <button
              key={f.value}
              onClick={() => setFloor(f.value)}
              style={{
                padding: "5px 14px",
                background: floor === f.value ? "#4A90E2" : "transparent",
                color: "white", border: "none", borderRadius: 6, cursor: "pointer",
                fontWeight: floor === f.value ? "700" : "400"
              }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />

        <button onClick={() => { setMode("node"); setSelectedNode(null) }}
          style={{ padding: "6px 14px", background: mode === "node" ? "#00b894" : "#555", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
          🟢 Place Node
        </button>

        <button onClick={() => { setMode("edge"); setSelectedNode(null) }}
          style={{ padding: "6px 14px", background: mode === "edge" ? "#e17055" : "#555", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
          🔗 Connect Edge
        </button>

        <button onClick={() => { setMode("delete"); setSelectedNode(null) }}
          style={{ padding: "6px 14px", background: mode === "delete" ? "#e74c3c" : "#555", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
          🗑️ Delete Node
        </button>

        <span style={{ color: "#aaa", fontSize: 13 }}>
          {FLOORS.find(f => f.value === floor)?.label} nodes: <b style={{ color: "white" }}>{currentNodes.length}</b> |
          Total edges: <b style={{ color: "white" }}>{edges.length}</b>
          {selectedNode && (
            <span style={{ color: "#fdcb6e", marginLeft: 10 }}>
              Selected: {selectedNode.label} ({FLOORS.find(f => f.value === selectedNode.floor)?.label})
            </span>
          )}
        </span>

        <span style={{
          marginLeft: "auto", padding: "4px 12px", borderRadius: 20, fontSize: 13,
          background: mode === "node" ? "#00b894" : mode === "edge" ? "#e17055" : "#e74c3c"
        }}>
          {mode.toUpperCase()}
        </span>
      </div>

      {/* Stair connection banner */}
      {mode === "edge" && selectedNode?.type === "stairs" && (
        <div style={{
          background: "#f39c12", color: "#000", padding: "6px 20px",
          fontSize: 13, fontWeight: 600, textAlign: "center"
        }}>
          ⚠️ Stair node selected from {FLOORS.find(f => f.value === selectedNode.floor)?.label} —
          switch to the matching floor and click the stair node there!
        </div>
      )}

      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        style={{ height: "calc(100vh - 50px)", width: "100%" }}
        maxZoom={2} minZoom={-3} zoom={-2}
      >
        <ImageOverlay url={FLOOR_MAPS[floor]} bounds={bounds} />

        <ClickHandler onMapClick={handleMapClick} />

        {/* Visible edges */}
        {visibleEdges.map((edge, i) => {
          const from = nodes.find(n => n.id === edge.from)
          const to = nodes.find(n => n.id === edge.to)
          if (!from || !to) return null
          const crossFloor = from.floor !== to.floor
          return (
            <Polyline
              key={i}
              positions={[[from.y, from.x], [to.y, to.x]]}
              color={crossFloor ? "#ff6b35" : edge.isStair ? "#f39c12" : "#3498db"}
              weight={crossFloor ? 3 : 2}
              dashArray={crossFloor ? "8, 6" : null}
            />
          )
        })}

        {/* Current floor nodes */}
        {currentNodes.map((node, i) => (
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
  )
}