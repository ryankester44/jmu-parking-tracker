import { STATUS_COLORS, STATUS_ICON } from "@/lib/colors";
import { STATUS_LABEL } from "@/lib/stats";
import type { AvailabilityStatus } from "@/lib/types";

/**
 * Status is never conveyed by color alone: every badge pairs a shape-coded
 * icon with the text label, so it reads the same for colorblind users
 * (dataviz skill: "status colors ship with an icon + label, never color
 * alone").
 */
export function StatusBadge({ status, size = "md" }: { status: AvailabilityStatus; size?: "sm" | "md" }) {
  const color = STATUS_COLORS[status].light;
  const icon = STATUS_ICON[status];
  const label = STATUS_LABEL[status];
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`}
      style={{ color, backgroundColor: `${color}1a` }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
