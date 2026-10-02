export default function CambioClave() {
  return (
    <main className="wrap" style={{ maxWidth: 480 }}>
      <h2>Cambio obligatorio de clave inicial</h2>
      <div className="card">
        <label>Nueva contraseña</label><input type="password" />
        <label>Confirmar</label><input type="password" />
        <div className="row" style={{ marginTop: 12 }}><a className="btn btn-primary" href="/admin/dashboard">Guardar y entrar</a></div>
      </div>
      <a href="/login">← Volver</a>
    </main>
  );
}
