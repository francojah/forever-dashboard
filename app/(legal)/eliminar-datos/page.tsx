export const metadata = { title: 'Eliminar tus datos · Faro' }

export default function EliminarDatos() {
  return (
    <>
      <h1>Cómo eliminar tus datos</h1>
      <p>Podés borrar los datos que Faro guarda de tu cuenta de Meta en cualquier momento:</p>
      <ul>
        <li>Desde Faro: Ajustes → Conexiones → desconectá la cuenta de Meta. Se borran el acceso y las cuentas publicitarias de ese negocio.</li>
        <li>Desde Facebook: Configuración → Integraciones comerciales → quitá la app. Faro deja de tener acceso de inmediato.</li>
        <li>Por email: escribí a <a href="mailto:francojah@gmail.com">francojah@gmail.com</a> con el asunto “Eliminar mis datos” y los borramos en un plazo de 30 días.</li>
      </ul>
    </>
  )
}
