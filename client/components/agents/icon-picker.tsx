"use client"

import * as Icons from "lucide-react"
import { cn } from "@/lib/utils"
import { AGENT_COLORS, AGENT_ICONS, type AgentColor, type AgentIcon } from "@/lib/agents/icons"

export function AgentIconRender({
  icon,
  color,
  size = 18,
  className,
}: {
  icon: string
  color?: string
  size?: number
  className?: string
}) {
  const Component = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[icon]
  if (!Component) return null
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <Component size={size} color={color ?? "currentColor"} />
    </span>
  )
}

interface Props {
  icon: AgentIcon | ""
  color: AgentColor | ""
  onChange: (next: { icon: AgentIcon; color: AgentColor }) => void
}

export function IconPicker({ icon, color, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Icon</p>
        <div className="grid grid-cols-10 gap-2">
          {AGENT_ICONS.map((name, idx) => {
            const Component = (Icons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[name]
            if (!Component) return null
            const selected = icon === name
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                onClick={() => onChange({ icon: name, color: (color || AGENT_COLORS[idx]) as AgentColor })}
                className={cn(
                  "h-9 w-9 flex items-center justify-center border transition-colors",
                  selected ? "border-accent text-accent bg-accent/10" : "border-border/40 text-muted-foreground hover:border-accent/60",
                )}
              >
                <Component size={18} />
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Color</p>
        <div className="grid grid-cols-10 gap-2">
          {AGENT_COLORS.map((hex) => {
            const selected = color === hex
            return (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                onClick={() => {
                  if (!icon) return
                  onChange({ icon, color: hex })
                }}
                className={cn(
                  "h-9 w-9 border transition-transform",
                  selected ? "border-accent ring-2 ring-accent" : "border-border/40 hover:border-foreground/40",
                )}
                style={{ backgroundColor: hex }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
