// components/ui/AvisoTruncado.tsx — Aviso cuando /api/asistencias recortó el rango
export function AvisoTruncado({ mostradas, total }: { mostradas: number; total: number }) {
  return (
    <div
      role="alert"
      className="card"
      style={{ background: "var(--warn-l)", borderColor: "var(--warn-b)", color: "var(--warn)", marginBottom: 16, padding: "12px 16px" }}
    >
      Mostrando {mostradas} de {total} registros: los totales de este rango están incompletos.
      Acote el rango de fechas o filtre por gerencia.
    </div>
  );
}
