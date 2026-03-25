import { useState } from "react"
import { MAPS } from "../constants/maps"
import { mapKeyFromNode } from "../utils/mapHelpers"
import { formatLabel } from "../utils/formatLabel"

export function RoutePanel({ pathStops, pathMapKeys, estimate, activeMapKey, onFloorChange }) {
  const [isMinimized, setIsMinimized] = useState(false)

  if (pathStops.length === 0) return null

  return (
    <div className="fixed bottom-[60px] md:bottom-5 left-0 md:left-5 right-0 md:right-auto z-[9998] md:w-auto md:min-w-[230px] md:max-w-[270px] max-h-[40vh] md:max-h-[55vh] flex flex-col bg-glass md:rounded-2xl rounded-t-2xl border-t md:border border-border p-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-[slideUp_0.25s_ease]">
      
      {/* Header section always visible */}
      <div className={`flex items-center justify-between ${!isMinimized ? "mb-3.5" : "mb-0"}`}>
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[1.5px] uppercase text-gold">
          <span>📍 Route — {pathStops.length} stops</span>
        </div>
        <div className="flex items-center gap-3">
          {estimate && (
            <div className="text-[10px] font-mono text-muted">
              ~{estimate.minutes} min · {estimate.metres}m
            </div>
          )}
          <button 
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="flex items-center justify-center w-5 h-5 bg-white/5 border border-white/10 rounded hover:bg-white/10 text-white/60 transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? "+" : "−"}
          </button>
        </div>
      </div>

      {/* Expandable content area */}
      {!isMinimized && (
        <div className="overflow-y-auto custom-scrollbar flex-1 pr-1">
          {/* Floor switcher chips — only shown for multi-floor routes */}
          {pathMapKeys.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {pathMapKeys.map((k, idx) => (
                <button
                  key={k}
                  type="button"
                  className={`border rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 transition-all ${
                    activeMapKey === k
                      ? "bg-gold-dim border-gold text-gold"
                      : "bg-transparent border-gold/25 text-muted hover:text-white hover:border-gold"
                  }`}
                  onClick={() => onFloorChange(k)}
                >
                  {idx + 1}. {(MAPS[k] || { name: k }).name}
                </button>
              ))}
            </div>
          )}

          {/* Stop list */}
          {pathStops.map((node, i) => {
            const isStart    = i === 0
            const isEnd      = i === pathStops.length - 1
            const isStair    = node.type === "stairs"
            const nextStop   = pathStops[i + 1]
            const floorChange = nextStop && mapKeyFromNode(node) !== mapKeyFromNode(nextStop)

            return (
              <div key={node.id}>
                <div className="flex items-start gap-2.5">
                  <div className="flex flex-col items-center pt-[3px] shrink-0">
                    <div className={`rounded-full border-2 ${
                      isStart ? "w-3 h-3 bg-green border-green shadow-[0_0_6px_rgba(34,201,122,0.5)]"
                      : isEnd ? "w-3 h-3 bg-red border-red shadow-[0_0_6px_rgba(240,79,90,0.5)]"
                      : isStair ? "w-2.5 h-2.5 bg-gold border-gold"
                      : "w-2.5 h-2.5 bg-navy border-gold/50"
                    }`} />
                    {i < pathStops.length - 1 && (
                      <div 
                        className={`min-h-[16px] flex-1 my-[3px] border-l-[2px] ${
                          floorChange 
                            ? "border-dashed border-gold/50" 
                            : "border-solid border-gold/20"
                        }`}
                      />
                    )}
                  </div>
                  <div className="pb-3 min-w-0">
                    <div className={`leading-snug ${isStart || isEnd ? "text-[13px] font-bold text-white" : "text-xs font-medium text-white/75"}`}>
                      {formatLabel(node.label)}
                    </div>
                    <span className="inline-block mt-[3px] text-[9.5px] font-semibold tracking-[0.8px] uppercase text-gold/80">
                      {(MAPS[mapKeyFromNode(node)] || { name: "—" }).name}
                    </span>
                  </div>
                </div>

                {/* Floor transition badge */}
                {floorChange && nextStop && (
                  <div className="flex items-start gap-2.5 my-0.5">
                    <div className="flex flex-col items-center shrink-0 w-3" />
                    <div className="text-[10px] font-bold text-gold bg-gold-dim border border-gold/30 rounded-[5px] px-[7px] py-[2px] whitespace-nowrap mb-2.5">
                      ⬆ Take stairs → {(MAPS[mapKeyFromNode(nextStop)] || { name: "Next Floor" }).name}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
