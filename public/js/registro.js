document.getElementById("formRegistro").addEventListener("submit", async (event) => {
    event.preventDefault();
    const mensaje = document.getElementById("mensajeRegistro");
    const nip = document.getElementById("registroClave").value;
    if (nip !== document.getElementById("registroConfirmar").value) {
        mensaje.textContent = "Las contraseñas no coinciden.";
        mensaje.className = "error";
        return;
    }
    try {
        const respuesta = await fetch("/api/registro/maestro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cuenta: document.getElementById("registroCuenta").value.trim(),
                nombre: document.getElementById("registroNombre").value.trim(),
                apellidos: document.getElementById("registroApellidos").value.trim(),
                nip
            })
        });
        const datos = await respuesta.json();
        mensaje.textContent = datos.message;
        mensaje.className = datos.success ? "exito" : "error";
        if (datos.success) {
            event.target.reset();
            const boton = event.target.querySelector("button[type=submit]");
            boton.textContent = "CUENTA CREADA";
            boton.disabled = true;
            setTimeout(() => { window.location.href = "/login.html?registro=ok"; }, 1600);
        }
    } catch {
        mensaje.textContent = "No se pudo conectar con el sistema. Inténtalo de nuevo.";
        mensaje.className = "error";
    }
});
