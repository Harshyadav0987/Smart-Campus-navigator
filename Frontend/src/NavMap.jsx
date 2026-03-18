import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { MapContainer, ImageOverlay, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "./NavMap.css"

const MAPS = {
  G:  { key: "G",  name: "Ground",      url: "/ground_floor.png",  w: 4642, h: 3924 },
  FA: { key: "FA", name: "1st Floor A", url: "/first_floor_a.png", w: 1742, h: 2442 },
  FB: { key: "FB", name: "1st Floor B", url: "/first_floor_b.png", w: 1111, h: 912  },
  S:  { key: "S",  name: "2nd Floor",   url: "/second_floor.png",  w: 681,  h: 852  },
}

function mapKeyFromNode(node) {
  if (!node) return "G"
  const floor = node.floor
  if (floor === 3) return "S"
  if (floor === 2) return "FB"
  if (floor === 1) return "FA"
  return "G"
}

function findClosestNode(nodes, latlng) {
  let closest = null
  let minDist = Infinity
  nodes.forEach(node => {
    const dx = node.x - latlng.lng
    const dy = node.y - latlng.lat
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < minDist) { minDist = dist; closest = node }
  })
  return minDist < 600 ? closest : null
}

function MapClickHandler({ nodes, onNodeClick, active }) {
  useMapEvents({
    click(e) {
      if (!active) return
      const closest = findClosestNode(nodes, e.latlng)
      if (closest) onNodeClick(closest)
    }
  })
  return null
}

function FitToBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    map.invalidateSize()
    map.fitBounds(bounds, { padding: [0, 0], animate: false })
    map.setMaxBounds(null)
  }, [map, bounds])
  return null
}

export default function NavMap() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [path, setPath] = useState([])
  const [pathNodes, setPathNodes] = useState([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState("from")
  const [selectMode, setSelectMode] = useState(false)
  const [activeMapKey, setActiveMapKey] = useState("G")
  const [activeMapUrl, setActiveMapUrl] = useState(MAPS.G.url)
  const [mapSize, setMapSize] = useState({ w: MAPS.G.w, h: MAPS.G.h })
  const [search, setSearch] = useState("")
  const searchGroupRef = useRef(null)
  const [dropdownRect, setDropdownRect] = useState(null)

  const bounds = useMemo(() => [[0, 0], [mapSize.h, mapSize.w]], [mapSize])

  useEffect(() => {
    fetch("http://localhost:5000/api/nodes").then(r => r.json()).then(setNodes)
    fetch("http://localhost:5000/api/edges").then(r => r.json()).then(setEdges)
  }, [])

  useEffect(() => {
    const map = MAPS[activeMapKey] || MAPS.G
    setActiveMapUrl(map.url)
    setMapSize({ w: map.w, h: map.h })
  }, [activeMapKey])

  const selectableNodes = nodes.filter(n =>
    ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type)
  )

  const nodesOnActiveMap = useMemo(
    () => nodes.filter(n => mapKeyFromNode(n) === activeMapKey),
    [nodes, activeMapKey]
  )

  const pathNodeObjects = useMemo(() => {
    if (pathNodes.length) return pathNodes.filter(Boolean)
    return path.map(id => nodes.find(n => n.id === id)).filter(Boolean)
  }, [pathNodes, path, nodes])

  const pathSegmentsOnActiveMap = useMemo(() => {
    const segs = []
    for (let i = 0; i < pathNodeObjects.length - 1; i++) {
      const a = pathNodeObjects[i]
      const b = pathNodeObjects[i + 1]
      if (mapKeyFromNode(a) !== activeMapKey) continue
      if (mapKeyFromNode(b) !== activeMapKey) continue
      segs.push([[a.y, a.x], [b.y, b.x]])
    }
    return segs
  }, [pathNodeObjects, activeMapKey])

  const pathMapKeys = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const node of pathNodeObjects) {
      const k = mapKeyFromNode(node)
      if (k && !seen.has(k)) {
        seen.add(k)
        result.push(k)
      }
    }
    return result
  }, [pathNodeObjects])

  const pathStops = pathNodeObjects
    .filter(n => n && ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type))

  async function handleNodeClick(node) {
    if (!selectMode) return
    if (!["room", "lab", "washroom", "faculty", "stairs"].includes(node.type)) return

    if (step === "from") {
      setFrom(node)
      setTo(null)
      setPath([])
      setPathNodes([])
      setError("")
      setStep("to")
      setActiveMapKey(mapKeyFromNode(node))
    } else {
      if (node.id === from?.id) return
      setTo(node)
      setSelectMode(false)
      setStep("from")
      setActiveMapKey(mapKeyFromNode(node))
      await navigate(from, node)
    }
  }

  async function navigate(fromNode, toNode) {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(
        `http://localhost:5000/api/nodes/navigate?from=${encodeURIComponent(fromNode.id)}&to=${encodeURIComponent(toNode.id)}`
      )
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setPath([])
        setPathNodes([])
      } else {
        setPath(data.path || [])
        setPathNodes(data.pathNodes || [])
        setActiveMapKey(mapKeyFromNode(fromNode))
      }
    } catch {
      setError("Server error!")
    }
    setLoading(false)
  }

  function handleClear() {
    setFrom(null); setTo(null)
    setPath([]); setPathNodes([]); setError("")
    setStep("from"); setSelectMode(false)
    setActiveMapKey("G")
  }

  function handleSelectToggle() {
    setSelectMode(prev => !prev)
    if (!selectMode) {
      setStep("from")
      setFrom(null); setTo(null)
      setPath([]); setPathNodes([]); setError("")
    }
  }

  const searchResults = search.trim()
    ? selectableNodes
        .filter(n => {
          const q = search.toLowerCase()
          const hay = `${n.label} ${n.id}`.toLowerCase()
          return hay.includes(q)
        })
        .slice(0, 8)
    : []

  useLayoutEffect(() => {
    if (searchResults.length === 0) { setDropdownRect(null); return }
    const el = searchGroupRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220) })
  }, [searchResults.length, search])

  async function handleDestinationSelect(node) {
    setTo(node)
    setSearch("")
    if (from && from.id !== node.id) {
      await navigate(from, node)
    } else {
      setStep("from")
      setSelectMode(true)
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <div className="logo-icon">🏛</div>
          MITS Nav
        </div>

        <div className="topbar-divider" />

        <div className={`step-card ${selectMode && step === "from" ? "active" : from ? "filled" : ""}`}>
          <div className="step-badge from">A</div>
          <div className="step-text">
            <span className="step-hint">From</span>
            <span className={`step-value ${!from ? "placeholder" : ""}`}>
              {from ? from.label : "Not selected"}
            </span>
          </div>
        </div>

        <div className="arrow">→</div>

        <div className={`step-card ${selectMode && step === "to" ? "active" : to ? "filled" : ""}`}>
          <div className="step-badge to">B</div>
          <div className="step-text">
            <span className="step-hint">To</span>
            <span className={`step-value ${!to ? "placeholder" : ""}`}>
              {to ? to.label : "Not selected"}
            </span>
          </div>
        </div>

        <div className="search-group" ref={searchGroupRef}>
          <input
            className="search-input"
            type="text"
            placeholder="Search destination…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {searchResults.length > 0 && dropdownRect && createPortal(
          <div
            className="search-results search-results-portal"
            style={{ position: "fixed", top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
          >
            {searchResults.map(node => (
              <button key={node.id} type="button" className="search-result-row" onClick={() => handleDestinationSelect(node)}>
                <span className="search-result-label">{node.label}</span>
                <span className="search-result-meta">{node.id}</span>
              </button>
            ))}
          </div>,
          document.body
        )}

        <button className={`btn-select ${selectMode ? "active" : ""}`} onClick={handleSelectToggle}>
          {selectMode
            ? step === "from" ? "🟢 Click your location" : "🔴 Click destination"
            : "📍 Select on Map"}
        </button>

        {(from || to || path.length > 0) && (
          <button className="btn-clear" onClick={handleClear}>✕ Clear</button>
        )}

        <div className="floor-tabs">
          {Object.values(MAPS).map(m => (
            <button
              key={m.key}
              type="button"
              className={`floor-tab ${activeMapKey === m.key ? "active" : ""}`}
              onClick={() => setActiveMapKey(m.key)}
            >
              {m.name}
            </button>
          ))}
        </div>

        {loading && <div className="status-chip chip-loading">🔍 Finding route...</div>}
        {error && <div className="status-chip chip-error">⚠ {error}</div>}
        {path.length > 0 && !loading && !error && (
          <div className="status-chip chip-success">✓ Route found</div>
        )}
        {!selectMode && !from && !loading && !error && path.length === 0 && (
          <div className="status-chip chip-hint">Press "Select on Map" to begin</div>
        )}
      </div>

      {selectMode && (
        <div className="select-hint">
          {step === "from" ? "📍 Click anywhere near your starting location" : "🏁 Click anywhere near your destination"}
        </div>
      )}

      <div className={`map-wrap ${selectMode ? "selecting" : ""}`}>
        <MapContainer
          key={`${activeMapKey}-${mapSize.w}-${mapSize.h}`}
          crs={L.CRS.Simple}
          bounds={bounds}
          style={{ height: "100%", width: "100%" }}
          maxZoom={2} minZoom={-3}
        >
          <FitToBounds bounds={bounds} />
          <ImageOverlay url={activeMapUrl} bounds={bounds} />

          <MapClickHandler
            nodes={nodesOnActiveMap.filter(n => ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type))}
            onNodeClick={handleNodeClick}
            active={selectMode}
          />

          {pathSegmentsOnActiveMap.map((positions, i) => (
            <Polyline
              key={`outline-${i}`}
              positions={positions}
              color="#fff"
              weight={12}
              opacity={0.28}
              lineCap="round"
              lineJoin="round"
            />
          ))}

          {pathSegmentsOnActiveMap.map((positions, i) => (
            <Polyline
              key={`path-${i}`}
              positions={positions}
              color="#4A90E2"
              weight={8}
              opacity={0.9}
              lineCap="round"
              lineJoin="round"
            />
          ))}

          {from && mapKeyFromNode(from) === activeMapKey && (
            <CircleMarker
              center={[from.y, from.x]}
              radius={12}
              pathOptions={{ color: "#fff", fillColor: "#22C55E", fillOpacity: 1, weight: 3 }}
            >
              <Tooltip permanent direction="top" offset={[0, -14]}>📍 {from.label}</Tooltip>
            </CircleMarker>
          )}

          {to && mapKeyFromNode(to) === activeMapKey && (
            <CircleMarker
              center={[to.y, to.x]}
              radius={12}
              pathOptions={{ color: "#fff", fillColor: "#EF4444", fillOpacity: 1, weight: 3 }}
            >
              <Tooltip permanent direction="top" offset={[0, -14]}>🏁 {to.label}</Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      {pathStops.length > 0 && (
        <div className="route-panel">
          <div className="route-title">📍 Route — {pathStops.length} stops</div>

          {pathMapKeys.length > 1 && (
            <div className="route-floors">
              {pathMapKeys.map((k, idx) => (
                <button
                  key={k}
                  type="button"
                  className={`route-floor-chip ${activeMapKey === k ? "active" : ""}`}
                  onClick={() => setActiveMapKey(k)}
                >
                  {idx + 1}. {(MAPS[k] || { name: k }).name}
                </button>
              ))}
            </div>
          )}

          {pathStops.map((node, i) => {
            const isStart = i === 0
            const isEnd = i === pathStops.length - 1
            return (
              <div className="route-stop" key={node.id}>
                <div className="route-stop-left">
                  <div className={`stop-dot ${isStart ? "start" : isEnd ? "end" : ""}`} />
                  {i < pathStops.length - 1 && <div className="stop-line" />}
                </div>
                <div className={`stop-label ${isStart ? "start" : isEnd ? "end" : ""}`}>
                  {node.label}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}