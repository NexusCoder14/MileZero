import type { ComponentStatus } from "@milezero/shared";

const LABEL: Record<ComponentStatus, string> = {
  ok: "Working",
  down: "Down",
  not_configured: "Not configured",
  unverified: "Not yet verified"
};

/** Status is always conveyed by text and a shape, never by colour alone. */
export function StatusBadge({ status }: { status: ComponentStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-shape" aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
