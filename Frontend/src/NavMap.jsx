import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import {
  MapContainer, ImageOverlay, CircleMarker,
  Polyline, Tooltip, useMap, useMapEvents
} from "react-leaflet"
import L from "leaflet"
import "./NavMap.css"

// ─── Floor config ────────────────────────────────────────────────
const MAPS = {
  G:  { key: "G",  name: "Ground",      url: "/ground_floor.png",  w: 4642, h: 3924 },
  FA: { key: "FA", name: "1st Floor A", url: "/first_floor_a.png", w: 1742, h: 2442 },
  FB: { key: "FB", name: "1st Floor B", url: "/first_floor_b.png", w: 1111, h: 912  },
  S:  { key: "S",  name: "2nd Floor",   url: "/second_floor.png",  w: 681,  h: 852  },
}

// ─── formatLabel ─────────────────────────────────────────────────
// Cleans raw DB node IDs into human-readable display names.
// e.g. "FA_computer_lab(J123)" → "Computer Lab (J123)"
//      "Stairs_G_to_Fl_5"      → "Stairs to 1st Floor"
//      "Male_Faculty_Washroom"  → "Male Faculty Washroom"
function formatLabel(raw) {
  if (!raw) return ""

  let s = raw

  // Normalize stair labels to something readable
  s = s.replace(/Stairs?_G_to_Fl_\d+/gi, "Stairs to 1st Floor")
  s = s.replace(/Stairs?_FA_to_/gi, "Stairs to ")
  s = s.replace(/Stairs?_FB_to_/gi, "Stairs to ")
  s = s.replace(/FA_stairs/gi, "1st Floor Stairs")
  s = s.replace(/FB_stairs/gi, "1st Floor B Stairs")
  s = s.replace(/S_stairs/gi, "2nd Floor Stairs")
  s = s.replace(/_stairs_\d+['"]?/gi, " Stairs")

  // Strip floor prefixes like G_, FA_, FB_, S_
  s = s.replace(/^(G|FA|FB|S)_/i, "")

  // Replace underscores with spaces
  s = s.replace(/_/g, " ")

  // Fix spacing around brackets
  s = s.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")")

  // Capitalize each word (but preserve content inside brackets)
  s = s.replace(/([^(]+)(\([^)]*\))?/g, (_, before, bracket) => {
    const capitalized = before
      .trim()
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
    return bracket ? `${capitalized} ${bracket}` : capitalized
  })

  // Fix common abbreviations back to proper case
  s = s.replace(/\bLab\b/g, "Lab")
  s = s.replace(/\bMale\b/gi, "Male")
  s = s.replace(/\bFemale\b/gi, "Female")
  s = s.replace(/\bWashroom\b/gi, "Washroom")
  s = s.replace(/\bFaculty\b/gi, "Faculty")

  return s.trim()
}

// ─── Helpers ─────────────────────────────────────────────────────
function mapKeyFromNode(node) {
  if (!node) return "G"
  if (node.floor === 3) return "S"
  if (node.floor === 2) return "FB"
  if (node.floor === 1) return "FA"
  return "G"
}

// Estimate walking distance in meters given pixel weight sum
// 1 pixel ≈ 0.05 metres at typical floor plan scale; tune as needed
const PX_TO_METRES = 0.05

function estimateDistance(pathNodeObjects, edges) {
  if (!pathNodeObjects || pathNodeObjects.length < 2) return null
  let total = 0
  for (let i = 0; i < pathNodeObjects.length - 1; i++) {
    const a = pathNodeObjects[i]
    const b = pathNodeObjects[i + 1]
    if (!a || !b) continue
    // Try to find the edge weight
    const edge = edges.find(
      e => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id)
    )
    if (edge) {
      total += edge.weight
    } else {
      const dx = b.x - a.x
      const dy = b.y - a.y
      total += Math.sqrt(dx * dx + dy * dy)
    }
  }
  const metres = Math.round(total * PX_TO_METRES)
  const minutes = Math.max(1, Math.round(metres / 80)) // avg 80m/min walking
  return { metres, minutes }
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

// ─── Node color by type ───────────────────────────────────────────
function nodeColor(type) {
  const map = {
    lab:      "#3B82F6",
    washroom: "#8B5CF6",
    faculty:  "#EC4899",
    stairs:   "#E8A020",
    garden:   "#22C97A",
    room:     "#94A3B8",
    corridor: "#475569",
  }
  return map[type] || "#94A3B8"
}

// ─── Sub-components ──────────────────────────────────────────────
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
  }, [map, bounds])
  return null
}

// ─── Main Component ───────────────────────────────────────────────
export default function NavMap() {
  const [nodes, setNodes]           = useState([])
  const [edges, setEdges]           = useState([])
  const [from, setFrom]             = useState(null)
  const [to, setTo]                 = useState(null)
  const [path, setPath]             = useState([])
  const [pathNodes, setPathNodes]   = useState([])
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)
  const [step, setStep]             = useState("from")
  const [selectMode, setSelectMode] = useState(false)
  const [activeMapKey, setActiveMapKey] = useState("G")
  const [search, setSearch]         = useState("")
  const [searchFor, setSearchFor]   = useState("from") // "from" or "to"
  const searchGroupRef              = useRef(null)
  const [dropdownRect, setDropdownRect] = useState(null)

  const activeMap = MAPS[activeMapKey] || MAPS.G
  const bounds    = useMemo(() => [[0, 0], [activeMap.h, activeMap.w]], [activeMap])

  // Fetch data once
  useEffect(() => {
    fetch("http://localhost:5000/api/nodes").then(r => r.json()).then(setNodes)
    fetch("http://localhost:5000/api/edges").then(r => r.json()).then(setEdges)
  }, [])

  // Nodes on current floor for click detection
  const nodesOnActiveMap = useMemo(
    () => nodes.filter(n => mapKeyFromNode(n) === activeMapKey),
    [nodes, activeMapKey]
  )

  // Selectable node types (not raw corridors)
  const selectableNodes = nodes.filter(n =>
    ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type)
  )

  // Full path node objects
  const pathNodeObjects = useMemo(() => {
    if (pathNodes.length) return pathNodes.filter(Boolean)
    return path.map(id => nodes.find(n => n.id === id)).filter(Boolean)
  }, [pathNodes, path, nodes])

  // Path segments visible on current floor
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

  // Which map keys does the route touch?
  const pathMapKeys = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const node of pathNodeObjects) {
      const k = mapKeyFromNode(node)
      if (k && !seen.has(k)) { seen.add(k); result.push(k) }
    }
    return result
  }, [pathNodeObjects])

  // Stops to show in route panel (skip plain corridors)
  const pathStops = pathNodeObjects.filter(
    n => n && ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type)
  )

  // Estimated distance/time
  const estimate = useMemo(
    () => estimateDistance(pathNodeObjects, edges),
    [pathNodeObjects, edges]
  )

  // ── Navigation call ─────────────────────────────────────────────
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
        setPath([]); setPathNodes([])
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

  // ── Node click (select mode) ─────────────────────────────────────
  async function handleNodeClick(node) {
    if (!selectMode) return
    if (!["room", "lab", "washroom", "faculty", "stairs"].includes(node.type)) return

    if (step === "from") {
      setFrom(node)
      setPath([]); setPathNodes([]); setError("")
      setStep("to")
      setSearchFor("to")
      setActiveMapKey(mapKeyFromNode(node))
      // If TO already exists, re-navigate immediately
      if (to && to.id !== node.id) {
        setSelectMode(false)
        setStep("from")
        setSearchFor("from")
        await navigate(node, to)
      }
    } else {
      if (node.id === from?.id) return
      setTo(node)
      setSelectMode(false)
      setStep("from")
      setSearchFor("from")
      setActiveMapKey(mapKeyFromNode(node))
      await navigate(from, node)
    }
  }

  // ── Search select ────────────────────────────────────────────────
  async function handleDestinationSelect(node) {
    setSearch("")

    // Auto-detect: if from not set yet, always set from first
    const settingFrom = searchFor === "from" || !from

    if (settingFrom) {
      setFrom(node)
      setPath([]); setPathNodes([]); setError("")
      setActiveMapKey(mapKeyFromNode(node))
      setSearchFor("to") // after setting from, next search should be for to
      if (to && to.id !== node.id) {
        await navigate(node, to)
      }
    } else {
      setTo(node)
      setActiveMapKey(mapKeyFromNode(node))
      if (from && from.id !== node.id) {
        await navigate(from, node)
      } else {
        setStep("from"); setSelectMode(true)
      }
    }
  }

  // ── Clear ────────────────────────────────────────────────────────
  function handleClear() {
    setFrom(null); setTo(null)
    setPath([]); setPathNodes([]); setError("")
    setStep("from"); setSelectMode(false)
    setActiveMapKey("G"); setSearchFor("from")
  }

  // ── Select toggle ────────────────────────────────────────────────
  function handleSelectToggle() {
    setSelectMode(prev => !prev)
    if (!selectMode) {
      setStep("from")
      setFrom(null); setTo(null)
      setPath([]); setPathNodes([]); setError("")
    }
  }

  // ── Search results ───────────────────────────────────────────────
  const searchResults = search.trim()
    ? selectableNodes
        .filter(n => {
          const q = search.toLowerCase()
          return `${n.label} ${n.id}`.toLowerCase().includes(q)
        })
        .slice(0, 8)
    : []

  useLayoutEffect(() => {
    if (searchResults.length === 0) { setDropdownRect(null); return }
    const el = searchGroupRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) })
  }, [searchResults.length, search])

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* ── Topbar ── */}
      <div className="topbar">

        {/* Logo */}
        <div className="logo">
          <img src="/mits_logo.png" alt="MITS" className="logo-img" />
          <div className="logo-text">
            <span className="logo-title">MITS Navigator</span>
            <span className="logo-sub">Campus Wayfinding</span>
          </div>
        </div>

        <div className="topbar-divider" />

        {/* From / To cards */}
        <div className="route-cards">
          <div
            className={`step-card clickable ${selectMode && step === "from" ? "active" : from ? "filled" : ""}`}
            onClick={() => {
              setStep("from")
              setSelectMode(true)
              setSearchFor("from")
              setSearch("")
            }}
            title="Click to change starting point"
          >
            <div className="step-badge from">A</div>
            <div className="step-text">
              <span className="step-hint">From {from ? "· tap to change" : ""}</span>
              <span className={`step-value ${!from ? "placeholder" : ""}`}>
                {from ? formatLabel(from.label) : "Not selected"}
              </span>
            </div>
          </div>

          <span className="route-arrow">→</span>

          <div
            className={`step-card clickable ${selectMode && step === "to" ? "active" : to ? "filled" : ""}`}
            onClick={() => {
              setStep("to")
              setSelectMode(true)
              setSearchFor("to")
              setSearch("")
            }}
            title="Click to change destination"
          >
            <div className="step-badge to">B</div>
            <div className="step-text">
              <span className="step-hint">To {to ? "· tap to change" : ""}</span>
              <span className={`step-value ${!to ? "placeholder" : ""}`}>
                {to ? formatLabel(to.label) : "Not selected"}
              </span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="search-group" ref={searchGroupRef}>
          {/* FROM / TO toggle pill */}
          <button
            className={`search-for-toggle ${searchFor === "from" ? "from" : "to"}`}
            onClick={() => setSearchFor(prev => prev === "from" ? "to" : "from")}
            type="button"
          >
            {searchFor === "from" ? "A FROM" : "B TO"}
          </button>
          <input
            className="search-input with-toggle"
            type="text"
            placeholder={searchFor === "from" ? "Search starting point…" : "Search destination…"}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Search dropdown */}
        {searchResults.length > 0 && dropdownRect && createPortal(
          <div
            className="search-results"
            style={{
              position: "fixed",
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
            }}
          >
            {searchResults.map(node => (
              <button
                key={node.id}
                type="button"
                className="search-result-row"
                onClick={() => handleDestinationSelect(node)}
              >
                <span className="search-result-label">{formatLabel(node.label)}</span>
                <span className="search-result-meta">{node.id}</span>
              </button>
            ))}
          </div>,
          document.body
        )}

        {/* Select on Map button */}
        <button className={`btn-select ${selectMode ? "active" : ""}`} onClick={handleSelectToggle}>
          {selectMode
            ? step === "from" ? "📍 Pick start" : "🏁 Pick end"
            : "📍 Select on Map"
          }
        </button>

        {(from || to || path.length > 0) && (
          <button className="btn-clear" onClick={handleClear}>✕ Clear</button>
        )}

        {/* Floor tabs */}
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

        {/* Status chips */}
        {loading && <div className="status-chip chip-loading">⏳ Searching…</div>}
        {error   && <div className="status-chip chip-error">⚠ {error}</div>}
        {path.length > 0 && !loading && !error && (
          <div className="status-chip chip-success">✓ Route found</div>
        )}
        {!selectMode && !from && !loading && !error && path.length === 0 && (
          <div className="status-chip chip-hint">Press "Select on Map" to begin</div>
        )}
      </div>

      {/* ── Select hint banner ── */}
      {selectMode && (
        <div className="select-hint">
          {step === "from"
            ? "📍 Click near your starting location"
            : "🏁 Click near your destination"}
        </div>
      )}

      {/* ── Full-screen map ── */}
      <div className={`map-wrap ${selectMode ? "selecting" : ""}`}>
        <MapContainer
          key={`${activeMapKey}-${activeMap.w}-${activeMap.h}`}
          crs={L.CRS.Simple}
          bounds={bounds}
          style={{ height: "100%", width: "100%" }}
          maxZoom={3}
          minZoom={-5}
          zoomSnap={0.01}
          zoomDelta={0.5}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <FitToBounds bounds={bounds} />
          <ImageOverlay url={activeMap.url} bounds={bounds} />

          <MapClickHandler
            nodes={nodesOnActiveMap.filter(n =>
              ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type)
            )}
            onNodeClick={handleNodeClick}
            active={selectMode}
          />

          {/* Path outline (glow effect) */}
          {pathSegmentsOnActiveMap.map((positions, i) => (
            <Polyline
              key={`glow-${i}`}
              positions={positions}
              color="#E8A020"
              weight={14}
              opacity={0.15}
              lineCap="round"
              lineJoin="round"
            />
          ))}

          {/* Path white outline */}
          {pathSegmentsOnActiveMap.map((positions, i) => (
            <Polyline
              key={`outline-${i}`}
              positions={positions}
              color="#fff"
              weight={10}
              opacity={0.25}
              lineCap="round"
              lineJoin="round"
            />
          ))}

          {/* Path main line */}
          {pathSegmentsOnActiveMap.map((positions, i) => (
            <Polyline
              key={`path-${i}`}
              positions={positions}
              color="#E8A020"
              weight={5}
              opacity={0.95}
              lineCap="round"
              lineJoin="round"
            />
          ))}

          {/* Node click targets — invisible normally, ghost dots in select mode */}
          {nodesOnActiveMap
            .filter(n => ["room", "lab", "washroom", "faculty", "stairs"].includes(n.type))
            .map((node, i) => (
              <CircleMarker
                key={`node-${i}`}
                center={[node.y, node.x]}
                radius={selectMode ? 10 : 6}
                pathOptions={{
                  // Fully transparent normally, subtle pulse ring in select mode
                  color: selectMode ? nodeColor(node.type) : "transparent",
                  fillColor: selectMode ? nodeColor(node.type) : "transparent",
                  fillOpacity: selectMode ? 0.18 : 0,
                  weight: selectMode ? 1.5 : 0,
                  opacity: selectMode ? 0.5 : 0,
                }}
                eventHandlers={selectMode ? { click: () => handleNodeClick(node) } : {}}
              >
                {/* Tooltip only shows on hover — clean label */}
                <Tooltip direction="top" offset={[0, -8]}>
                  {formatLabel(node.label)}
                </Tooltip>
              </CircleMarker>
            ))
          }

          {/* FROM marker */}
          {from && mapKeyFromNode(from) === activeMapKey && (
            <CircleMarker
              center={[from.y, from.x]}
              radius={13}
              pathOptions={{
                color: "#fff",
                fillColor: "#22C97A",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -16]}>
                📍 {formatLabel(from.label)}
              </Tooltip>
            </CircleMarker>
          )}

          {/* TO marker */}
          {to && mapKeyFromNode(to) === activeMapKey && (
            <CircleMarker
              center={[to.y, to.x]}
              radius={13}
              pathOptions={{
                color: "#fff",
                fillColor: "#F04F5A",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -16]}>
                🏁 {formatLabel(to.label)}
              </Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      {/* ── Route Panel ── */}
      {pathStops.length > 0 && (
        <div className="route-panel">
          <div className="route-panel-header">
            <div className="route-title">📍 Route — {pathStops.length} stops</div>
            {estimate && (
              <div className="route-distance">
                ~{estimate.minutes} min · {estimate.metres}m
              </div>
            )}
          </div>

          {/* Floor switcher chips */}
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

          {/* Stop list */}
          {pathStops.map((node, i) => {
            const isStart = i === 0
            const isEnd   = i === pathStops.length - 1
            const isStair = node.type === "stairs"

            // Detect floor change: is next stop on a different floor?
            const nextStop = pathStops[i + 1]
            const floorChange = nextStop && mapKeyFromNode(node) !== mapKeyFromNode(nextStop)

            return (
              <div key={node.id}>
                <div className="route-stop">
                  <div className="route-stop-left">
                    <div className={`stop-dot ${isStart ? "start" : isEnd ? "end" : isStair ? "stair" : ""}`} />
                    {i < pathStops.length - 1 && (
                      <div className={`stop-line ${floorChange ? "stair-line" : ""}`} />
                    )}
                  </div>
                  <div className="stop-content">
                    <div className={`stop-label ${isStart ? "start" : isEnd ? "end" : ""}`}>
                      {formatLabel(node.label)}
                    </div>
                    <span className="stop-floor-tag">
                      {(MAPS[mapKeyFromNode(node)] || { name: "—" }).name}
                    </span>
                  </div>
                </div>

                {/* Floor transition indicator */}
                {floorChange && nextStop && (
                  <div className="stair-transition">
                    <div className="route-stop-left" />
                    <div className="stair-badge">
                      ⬆ Take stairs → {(MAPS[mapKeyFromNode(nextStop)] || { name: "Next Floor" }).name}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}