import { useMemo, useEffect } from "react"
import { MapContainer, ImageOverlay, CircleMarker, Polyline, Tooltip, ZoomControl, useMap } from "react-leaflet"
import "../../utils/leafletSetup"
import "leaflet-rotate"
import * as L from "leaflet"

import { MAPS, SELECTABLE_TYPES } from "../../constants/maps"
import { mapKeyFromNode, nodeColor } from "../../utils/mapHelpers"
import { formatLabel } from "../../utils/formatLabel"
import { FitToBounds } from "./FitToBounds"
import { MapClickHandler } from "./MapClickHandler"

/**
 * Ensures map rotation and scroll settings apply properly.
 * Adds reliable fallback for custom keyboard+drag rotation on laptops.
 */
function MapSettingsUpdater() {
  const map = useMap();
  useEffect(() => {
    // Force native touch rotation if capable
    if (map.touchRotate && !map.touchRotate.enabled()) map.touchRotate.enable();

    const container = map.getContainer();
    let isRotating = false;
    let lastMousePos = null;

    const handleMouseDown = (e) => {
      if ((e.shiftKey || e.altKey) && e.button === 0) {
        // Right click or shift+click or alt+click starts rotation
        isRotating = true;
        map.dragging.disable(); // Prevent default map panning
        lastMousePos = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseMove = (e) => {
      if (!isRotating) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      // Calculate angles relative to the visual center of the map
      const angle1 = Math.atan2(lastMousePos.y - center.y, lastMousePos.x - center.x);
      const angle2 = Math.atan2(e.clientY - center.y, e.clientX - center.x);
      
      let angleDiff = (angle2 - angle1) * (180 / Math.PI);
      
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;

      const currentBearing = map.getBearing() || 0;
      map.setBearing(currentBearing + angleDiff);

      lastMousePos = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e) => {
      if (isRotating) {
        isRotating = false;
        map.dragging.enable();
      }
    };

    // Use capture phase to ensure we intercept the events before Leaflet does
    container.addEventListener('mousedown', handleMouseDown, { capture: true });
    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, { capture: true });
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [map]);
  return null;
}

/**
 * MapView — the full-screen Leaflet map with path rendering,
 * node markers, and FROM/TO markers.
 */
export function MapView({
  activeMapKey,
  nodesOnActiveMap,
  pathSegmentsOnActiveMap,
  from, to,
  selectMode,
  onNodeClick,
}) {
  const activeMap = MAPS[activeMapKey] || MAPS.G
  const bounds = useMemo(
    () => [[0, 0], [activeMap.h, activeMap.w]],
    [activeMap]
  )

  const clickableNodes = nodesOnActiveMap.filter(n =>
    SELECTABLE_TYPES.includes(n.type)
  )

  return (
    <div className={`fixed top-0 bottom-11 md:bottom-0 left-0 right-0 z-[1] bg-[#0B1C3A] overflow-hidden map-wrap ${selectMode ? "selecting" : ""}`}>
      <MapContainer
        key={`${activeMapKey}-${activeMap.w}-${activeMap.h}`}
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ height: "100%", width: "100%" }}
        maxZoom={1.5}
        minZoom={-5}
        zoomSnap={0.1}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={15}
        scrollWheelZoom={true}
        boxZoom={false}
        attributionControl={false}
        zoomControl={false}
        rotate={true}
        touchRotate={true}
        shiftKeyRotate={true}
        rotateControl={{ closeOnZeroBearing: false, position: 'topright' }}
      >
        <MapSettingsUpdater />
        <ZoomControl position="topright" />
        <FitToBounds bounds={bounds} />
        <ImageOverlay url={activeMap.url} bounds={bounds} />

        <MapClickHandler
          nodes={clickableNodes}
          onNodeClick={onNodeClick}
          active={selectMode}
        />

        {/* Path glow */}
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


        {/* FROM marker */}
        {from && mapKeyFromNode(from) === activeMapKey && (
          <CircleMarker
            center={[from.y, from.x]}
            radius={13}
            pathOptions={{ color: "#fff", fillColor: "#22C97A", fillOpacity: 1, weight: 3 }}
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
            pathOptions={{ color: "#fff", fillColor: "#F04F5A", fillOpacity: 1, weight: 3 }}
          >
            <Tooltip permanent direction="top" offset={[0, -16]}>
              🏁 {formatLabel(to.label)}
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  )
}
