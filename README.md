# ¡Gracias a ti!

**Plataforma integral para la gestión logística de ayuda humanitaria en situaciones de emergencia.**
El nombre reconoce a quienes hacen que todo funcione: los voluntarios y las personas que deciden ayudar. La aplicación existe para que cualquiera que quiera colaborar pueda hacerlo de la forma más fácil y coordinada posible.
Este sistema conecta a todos los actores involucrados (Ciudadanos, Voluntarios, Puestos de Ayuda y Coordinadores) para maximizar la eficiencia y transparencia de la ayuda.

---

## 👥 Roles del Ecosistema

La aplicación se estructura en torno a 4 roles fundamentales, cada uno con funciones específicas documentadas en detalle:

### 1. [Ciudadano](./ROL_CIUDADANO.md)
*El sensor y beneficiario del sistema.*
- **Función:** Solicitar ayuda, ver recursos cercanos y **reportar el estado de las vías** (cortadas/accesibles) para mejorar la navegación de todos.
- [📄 Ver documentación de Ciudadano](./ROL_CIUDADANO.md)

### 2. [Voluntario / Donante](./ROL_VOLUNTARIO_DONANTE.md)
*El motor logístico.*
- **Función:** Transportar ayuda de un punto a otro. Utiliza un sistema de navegación inteligente que evita calles bloqueadas y prioriza los puntos con stock crítico.
- [📄 Ver documentación de Voluntario](./ROL_VOLUNTARIO_DONANTE.md)

### 3. [Puesto de Emergencia (Ring)](./ROL_PUESTO_EMERGENCIA.md)
*El nodo de distribución.*
- **Función:** Puntos físicos (colegios, pabellones) que reciben y entregan material. Gestionan stock en tiempo real y validan entregas mediante códigos QR.
- [📄 Ver documentación de Puesto de Emergencia](./ROL_PUESTO_EMERGENCIA.md)

### 4. [Manager / Coordinador](./ROL_MANAGER_COORDINADOR.md)
*La estrategia.*
- **Función:** Define la emergencia, configura los tipos de ayuda necesarios (mano de obra vs recursos) y envía alertas globales.
- [📄 Ver documentación de Manager](./ROL_MANAGER_COORDINADOR.md)

---

## 🛠️ Arquitectura y Tecnología

El sistema está diseñado bajo una filosofía **Offline-First** para garantizar su funcionamiento cuando las telecomunicaciones fallan.

📄 **[Ver Guía de Implementación Tecnológica](./IMPLEMENTACION_TECNOLOGICA.md)**

### Puntos Clave:
- **Resiliencia:** Funcionamiento sin internet mediante *Service Workers* e *IndexedDB*.
- **Sincronización:** Cola inteligente de datos que se suben cuando recupera la conexión.
- **Seguridad:** Trazabilidad total de donaciones mediante QR criptográficos.
- **Navegación:** Algoritmos de enrutamiento que consideran el estado real de las vías reportado por la comunidad.

---

## 📂 Estructura del Proyecto

- `ROL_CIUDADANO.md`: Funcionalidades para usuarios generales.
- `ROL_VOLUNTARIO_DONANTE.md`: Guía para conductores y donantes.
- `ROL_PUESTO_EMERGENCIA.md`: Gestión de inventarios y validación en puntos físicos.
- `ROL_MANAGER_COORDINADOR.md`: Panel de administración de crisis.
- `IMPLEMENTACION_TECNOLOGICA.md`: Stack técnico, infraestructura y seguridad.

---

🚧 **Estado del Proyecto:** En fase de diseño y documentación técnica.