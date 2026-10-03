import { badgeClass, type EstadoEntrada, type EstadoSalida } from "@/lib/types";

type Props = {
  estadoEntrada: EstadoEntrada | EstadoSalida | string;
  estadoOriginal?: "TARDE" | "FALTA" | null;
};

/**
 * Muestra el estado de entrada.
 * Si el registro fue JUSTIFICADO desde TARDE o FALTA, muestra el estado original
 * tachado + flecha + JUSTIFICADO, preservando la trazabilidad sin borrar el error.
 *
 *  TARDE ──→ JUSTIFICADO   (cuando estadoEntrada=JUSTIFICADO, estadoOriginal=TARDE)
 *  FALTA ──→ JUSTIFICADO   (cuando estadoEntrada=JUSTIFICADO, estadoOriginal=FALTA)
 *  TARDE                   (sin justificar)
 */
export function BadgeEstadoEntrada({ estadoEntrada, estadoOriginal }: Props) {
  // Caso: fue justificado desde TARDE o FALTA → mostrar ambos
  if (estadoEntrada === "JUSTIFICADO" && estadoOriginal) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
        {/* Estado original tachado */}
        <span
          className={badgeClass(estadoOriginal)}
          style={{ textDecoration: "line-through", opacity: 0.55 }}
          title={`Estado original: ${estadoOriginal}`}
        >
          {estadoOriginal}
        </span>
        {/* Flecha de transición */}
        <span style={{ color: "var(--muted-2)", fontSize: ".75rem", lineHeight: 1 }}>→</span>
        {/* Estado actual JUSTIFICADO */}
        <span className={badgeClass("JUSTIFICADO")} title="Justificado por autorización">
          JUSTIFICADO
        </span>
      </span>
    );
  }

  // Caso normal: un solo badge
  return <span className={badgeClass(estadoEntrada as EstadoEntrada | EstadoSalida | null | undefined)}>{estadoEntrada.replace(/_/g, " ")}</span>;
}
