import { useState, useEffect } from "react"
import { MapContainer, ImageOverlay, CircleMarker, Polyline, Tooltip, useMapEvents } from "react-leaflet"
import L from "leaflet"

// ─── Config ──────────────────────────────────────────────────────
const FLOOR_SIZES = {
  0: { w: 4642, h: 3924 },
  1: { w: 1742, h: 2442 },
  2: { w: 1111, h: 912  },
  3: { w: 681,  h: 852  },
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

const NODE_TYPES = ["room", "corridor", "stairs", "washroom", "lab", "garden", "faculty"]

// ─── Modal Component ──────────────────────────────────────────────
function NodeModal({ latlng, floor, onConfirm, onCancel }) {
  const [label, setLabel] = useState("")
  const [type, setType]   = useState("room")
  const [error, setError] = useState("")

  function handleSubmit(e) {
    e.preventDefault()
    if (!label.trim()) { setError("Room ID is required"); return }
    onConfirm({ label: label.trim(), type })
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>📍 Place New Node</span>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        {/* Coords info */}
        <div style={styles.coordsBadge}>
          x: {Math.round(latlng.lng)} · y: {Math.round(latlng.lat)} · Floor: {FLOORS.find(f => f.value === floor)?.label}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Room ID */}
          <div style={styles.field}>
            <label style={styles.label}>Room ID / Label</label>
            <input
              style={styles.input}
              type="text"
              placeholder="e.g. J014, FA_computer_lab"
              value={label}
              onChange={e => { setLabel(e.target.value); setError("") }}
              autoFocus
            />
            {error && <span style={styles.errorText}>{error}</span>}
          </div>

          {/* Node Type */}
          <div style={styles.field}>
            <label style={styles.label}>Node Type</label>
            <div style={styles.typeGrid}>
              {NODE_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  style={{
                    ...styles.typeBtn,
                    background: type === t ? typeColors[t] : "rgba(255,255,255,0.05)",
                    borderColor: type === t ? typeColors[t] : "rgba(255,255,255,0.1)",
                    color: type === t ? "#fff" : "rgba(255,255,255,0.6)",
                    fontWeight: type === t ? 700 : 400,
                  }}
                  onClick={() => setType(t)}
                >
                  {typeIcons[t]} {t}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" style={styles.confirmBtn}>
              ✓ Place Node
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────
function DeleteModal({ node, onConfirm, onCancel }) {
  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, maxWidth: 360 }}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>🗑️ Delete Node</span>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, margin: "16px 0" }}>
          Are you sure you want to delete <b style={{ color: "#fff" }}>{node.label}</b>?
          <br />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6, display: "block" }}>
            All edges connected to this node will also be removed.
          </span>
        </p>
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            style={{ ...styles.confirmBtn, background: "#e74c3c", boxShadow: "0 4px 14px rgba(231,76,60,0.4)" }}
            onClick={onConfirm}
          >
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Click Handler ────────────────────────────────────────────────
function ClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng) } })
  return null
}

// ─── Main Component ───────────────────────────────────────────────
export default function AdminMap() {
  const [nodes, setNodes]           = useState([])
  const [edges, setEdges]           = useState([])
  const [mode, setMode]             = useState("node")
  const [selectedNode, setSelectedNode] = useState(null)
  const [floor, setFloor]           = useState(0)

  // Modal state
  const [pendingClick, setPendingClick] = useState(null)   // latlng waiting for modal
  const [deleteTarget, setDeleteTarget] = useState(null)   // node waiting for delete confirm

  const mapSize = FLOOR_SIZES[floor] || FLOOR_SIZES[0]
  const bounds  = [[0, 0], [mapSize.h, mapSize.w]]
  const currentNodes = nodes.filter(n => n.floor === floor)

  useEffect(() => {
    fetch("http://localhost:5000/api/nodes").then(r => r.json()).then(setNodes)
    fetch("http://localhost:5000/api/edges").then(r => r.json()).then(setEdges)
  }, [])

  // ── Map click → open modal instead of prompt ──────────────────
  function handleMapClick(latlng) {
    if (mode !== "node") return
    setPendingClick(latlng)  // opens the modal
  }

  // ── Modal confirmed → save node ───────────────────────────────
  async function handleModalConfirm({ label, type }) {
    const newNode = {
      id: label, label,
      type,
      floor,
      x: Math.round(pendingClick.lng),
      y: Math.round(pendingClick.lat),
    }
    setPendingClick(null)

    const res = await fetch("http://localhost:5000/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newNode),
    })
    const saved = await res.json()
    setNodes(prev => [...prev, saved])
  }

  // ── Node click ─────────────────────────────────────────────────
  function handleNodeClick(node) {
    if (mode === "delete") {
      setDeleteTarget(node)  // opens delete confirm modal
      return
    }

    if (mode !== "edge") return

    if (!selectedNode) {
      setSelectedNode(node)
    } else {
      saveEdge(selectedNode, node)
    }
  }

  // ── Save edge ──────────────────────────────────────────────────
  async function saveEdge(nodeA, nodeB) {
    const dx = nodeB.x - nodeA.x
    const dy = nodeB.y - nodeA.y
    const weight = Math.round(Math.sqrt(dx * dx + dy * dy))
    const isStair = nodeA.type === "stairs" || nodeB.type === "stairs"
    const finalWeight = nodeA.floor !== nodeB.floor ? 200 : weight

    const newEdge = { from: nodeA.id, to: nodeB.id, weight: finalWeight, isStair }

    const res = await fetch("http://localhost:5000/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEdge),
    })
    const saved = await res.json()
    setEdges(prev => [...prev, saved])
    setSelectedNode(null)
  }

  // ── Delete confirmed ───────────────────────────────────────────
  async function handleDeleteConfirm() {
    const node = deleteTarget
    setDeleteTarget(null)
    await fetch(`http://localhost:5000/api/nodes?id=${encodeURIComponent(node.id)}`, { method: "DELETE" })
    setNodes(prev => prev.filter(n => n.id !== node.id))
    setEdges(prev => prev.filter(e => e.from !== node.id && e.to !== node.id))
  }

  const visibleEdges = edges.filter(edge => {
    const from = nodes.find(n => n.id === edge.from)
    const to   = nodes.find(n => n.id === edge.to)
    if (!from || !to) return false
    return from.floor === floor || to.floor === floor
  })

  function getNodeColor(node) {
    if (selectedNode?.id === node.id) return "#e74c3c"
    if (mode === "delete") return "#e74c3c"
    return typeColors[node.type] || "#2ecc71"
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={styles.topbar}>
        <div style={styles.logoArea}>
          <img src="/mits_logo.png" alt="MITS" style={styles.logo} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>MITS Admin Tool</div>
            <div style={{ fontSize: 10, color: "#E8A020", letterSpacing: 1 }}>NODE EDITOR</div>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Floor tabs */}
        <div style={styles.floorTabs}>
          {FLOORS.map(f => (
            <button
              key={f.value}
              onClick={() => setFloor(f.value)}
              style={{
                ...styles.floorTab,
                background: floor === f.value ? "#E8A020" : "transparent",
                color: floor === f.value ? "#0B1C3A" : "rgba(255,255,255,0.6)",
                fontWeight: floor === f.value ? 700 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={styles.divider} />

        {/* Mode buttons */}
        <button
          onClick={() => { setMode("node"); setSelectedNode(null) }}
          style={{ ...styles.modeBtn, background: mode === "node" ? "#00b894" : "rgba(255,255,255,0.06)", boxShadow: mode === "node" ? "0 4px 14px rgba(0,184,148,0.4)" : "none" }}
        >
          🟢 Place Node
        </button>

        <button
          onClick={() => { setMode("edge"); setSelectedNode(null) }}
          style={{ ...styles.modeBtn, background: mode === "edge" ? "#e17055" : "rgba(255,255,255,0.06)", boxShadow: mode === "edge" ? "0 4px 14px rgba(225,112,85,0.4)" : "none" }}
        >
          🔗 Connect Edge
        </button>

        <button
          onClick={() => { setMode("delete"); setSelectedNode(null) }}
          style={{ ...styles.modeBtn, background: mode === "delete" ? "#e74c3c" : "rgba(255,255,255,0.06)", boxShadow: mode === "delete" ? "0 4px 14px rgba(231,76,60,0.4)" : "none" }}
        >
          🗑️ Delete Node
        </button>

        {/* Stats */}
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginLeft: 4 }}>
          <b style={{ color: "#fff" }}>{currentNodes.length}</b> nodes ·{" "}
          <b style={{ color: "#fff" }}>{edges.length}</b> edges
        </span>

        {selectedNode && (
          <span style={{ color: "#fdcb6e", fontSize: 12 }}>
            ● Selected: {selectedNode.label}
          </span>
        )}

        {/* Mode chip */}
        <span style={{
          marginLeft: "auto",
          padding: "4px 14px",
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          background: mode === "node" ? "#00b894" : mode === "edge" ? "#e17055" : "#e74c3c",
          color: "#fff",
        }}>
          {mode.toUpperCase()}
        </span>
      </div>

      {/* ── Stair banner ── */}
      {mode === "edge" && selectedNode?.type === "stairs" && (
        <div style={styles.stairBanner}>
          ⚠️ Stair node selected from {FLOORS.find(f => f.value === selectedNode.floor)?.label} — switch floor and click matching stair node
        </div>
      )}

      {/* ── Map ── */}
      <MapContainer
        key={`${floor}-${mapSize.w}-${mapSize.h}`}
        crs={L.CRS.Simple}
        bounds={bounds}
        style={{ height: "calc(100vh - 52px)", width: "100%", background: "#f0ece4" }}
        maxZoom={3}
        minZoom={-5}
        zoomSnap={0.25}
        attributionControl={false}
      >
        <ImageOverlay url={FLOOR_MAPS[floor]} bounds={bounds} />
        <ClickHandler onMapClick={handleMapClick} />

        {/* Edges */}
        {visibleEdges.map((edge, i) => {
          const from = nodes.find(n => n.id === edge.from)
          const to   = nodes.find(n => n.id === edge.to)
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

        {/* Nodes */}
        {currentNodes.map((node, i) => (
          <CircleMarker
            key={i}
            center={[node.y, node.x]}
            radius={6}
            pathOptions={{
              color: getNodeColor(node),
              fillColor: getNodeColor(node),
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => handleNodeClick(node) }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              {node.label}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Node placement modal ── */}
      {pendingClick && (
        <NodeModal
          latlng={pendingClick}
          floor={floor}
          onConfirm={handleModalConfirm}
          onCancel={() => setPendingClick(null)}
        />
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <DeleteModal
          node={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Node type colors & icons ─────────────────────────────────────
const typeColors = {
  room:     "#2ecc71",
  corridor: "#3498db",
  stairs:   "#f39c12",
  washroom: "#9b59b6",
  lab:      "#1abc9c",
  garden:   "#27ae60",
  faculty:  "#e84393",
}

const typeIcons = {
  room:     "🚪",
  corridor: "🛤️",
  stairs:   "🪜",
  washroom: "🚻",
  lab:      "🔬",
  garden:   "🌿",
  faculty:  "👨‍🏫",
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = {
  topbar: {
    height: 52,
    padding: "0 16px",
    background: "rgba(11, 28, 58, 0.98)",
    color: "white",
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid rgba(232,160,32,0.2)",
    flexWrap: "wrap",
    fontFamily: "'DM Sans', sans-serif",
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "2px solid #E8A020",
  },
  divider: {
    width: 1,
    height: 28,
    background: "rgba(232,160,32,0.2)",
    flexShrink: 0,
  },
  floorTabs: {
    display: "flex",
    gap: 3,
    padding: 3,
    background: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    border: "1px solid rgba(232,160,32,0.15)",
  },
  floorTab: {
    padding: "4px 12px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  modeBtn: {
    padding: "6px 14px",
    border: "none",
    borderRadius: 7,
    cursor: "pointer",
    color: "white",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
  },
  stairBanner: {
    background: "#f39c12",
    color: "#000",
    padding: "6px 20px",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
  },

  // Modal styles
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
  },
  modal: {
    background: "#0D2045",
    border: "1px solid rgba(232,160,32,0.25)",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
    fontFamily: "'DM Sans', sans-serif",
    color: "#fff",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 700,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
    fontSize: 16,
    padding: "2px 6px",
    borderRadius: 4,
  },
  coordsBadge: {
    background: "rgba(232,160,32,0.1)",
    border: "1px solid rgba(232,160,32,0.2)",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 11,
    fontFamily: "monospace",
    color: "#E8A020",
    marginBottom: 18,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
    marginBottom: 7,
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  errorText: {
    fontSize: 11,
    color: "#f97373",
    marginTop: 4,
    display: "block",
  },
  typeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 6,
  },
  typeBtn: {
    padding: "7px 4px",
    border: "1px solid",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 11,
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
    textAlign: "center",
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 20,
  },
  cancelBtn: {
    padding: "8px 18px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
  },
  confirmBtn: {
    padding: "8px 20px",
    background: "#00b894",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,184,148,0.4)",
  },
}