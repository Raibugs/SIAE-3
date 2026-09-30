const formularioLogin = document.getElementById("formLogin");
const tipoAcceso = document.getElementById("tipoAcceso");
function actualizarEtiquetaCuenta() {
    const etiqueta = document.querySelector('label[for="cuenta"]');
    etiqueta.textContent = tipoAcceso.value === "administrador" ? "Usuario de administrador" : "Número de trabajador";
    document.getElementById("cuenta").placeholder = tipoAcceso.value === "administrador" ? "Usuario asignado" : "Número de trabajador";
}
tipoAcceso.addEventListener("change", actualizarEtiquetaCuenta);
actualizarEtiquetaCuenta();
formularioLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mensaje = document.getElementById("mensajeLogin");
    const respuesta = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta: document.getElementById("cuenta").value.trim(), nip: document.getElementById("nip").value, tipo: document.getElementById("tipoAcceso").value })
    });
    const datos = await respuesta.json();
    if (!datos.success) { mensaje.textContent = datos.message; mensaje.className = "error"; return; }
    window.location.href = datos.usuario.tipo === "administrador" ? "/admin.html" : "/portal.html";
});
if (new URLSearchParams(window.location.search).get("registro") === "ok") {
    const mensaje = document.getElementById("mensajeLogin");
    mensaje.textContent = "Cuenta creada. Inicia sesión con tu número de trabajador y contraseña.";
    mensaje.className = "exito";
}
