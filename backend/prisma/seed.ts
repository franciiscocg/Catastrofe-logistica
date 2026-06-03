import bcrypt from 'bcryptjs'
import {
  EstadoAsignacionIncidencia,
  EstadoAsignacionPuesto,
  EstadoDonacion,
  EstadoSolicitudParticipacionPuesto,
  EstadoSolicitudPuesto,
  EstadoVia,
  PrismaClient,
  RolUsuario,
  TipoInventario,
} from '@prisma/client'

const prisma = new PrismaClient()
let password = ''

async function upsertUser(input: {
  email: string
  nombre: string
  apellidos: string
  dni: string
  telefono: string
  roles: RolUsuario[]
}) {
  return prisma.usuario.upsert({
    where: { email: input.email },
    update: {
      nombre: input.nombre,
      apellidos: input.apellidos,
      telefono: input.telefono,
      roles: input.roles,
      activo: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      ...input,
      password,
      activo: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  })
}

async function ensureCoordinatorAccess(email: string) {
  const user = await prisma.usuario.findUnique({ where: { email } })

  if (!user) {
    return upsertUser({
      email,
      nombre: 'Alvaro',
      apellidos: 'Martin',
      dni: '20030000A',
      telefono: '+34600002003',
      roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO, RolUsuario.COORDINADOR],
    })
  }

  const roles = new Set<RolUsuario>([...user.roles, RolUsuario.COORDINADOR])
  return prisma.usuario.update({
    where: { id: user.id },
    data: {
      roles: [...roles],
      activo: true,
      emailVerified: true,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  })
}

async function ensureVoluntario(
  usuarioId: string,
  modalidad: string,
  vehiculo: Record<string, unknown> | null = null,
) {
  return prisma.voluntario.upsert({
    where: { usuarioId },
    update: { modalidad, vehiculo, verificado: true },
    create: { usuarioId, modalidad, vehiculo, verificado: true },
  })
}

async function getOrCreateProduct(nombre: string, categoria: string, unidad: string) {
  const existing = await prisma.producto.findFirst({
    where: {
      nombre: { equals: nombre, mode: 'insensitive' },
      unidad: { equals: unidad, mode: 'insensitive' },
    },
  })
  if (existing) return existing

  return prisma.producto.create({ data: { nombre, categoria, unidad } })
}

async function setInventory(puestoId: string, productoId: string, tipo: TipoInventario, cantidad: number) {
  return prisma.inventario.upsert({
    where: { puestoId_productoId_tipo: { puestoId, productoId, tipo } },
    update: { cantidad },
    create: { puestoId, productoId, tipo, cantidad },
  })
}

async function upsertAuditLog(input: {
  id: string
  usuarioId?: string
  accion: string
  entidad: string
  entidadId: string
  datos: Record<string, unknown>
}) {
  return prisma.auditLog.upsert({
    where: { id: input.id },
    update: {
      usuarioId: input.usuarioId,
      accion: input.accion,
      entidad: input.entidad,
      entidadId: input.entidadId,
      datos: input.datos,
    },
    create: input,
  })
}

async function main() {
  password = await bcrypt.hash('Demo12345', 12)

  const alvaro = await ensureCoordinatorAccess('alvaro.martin2003@gmail.com')

  const coordinador = await upsertUser({
    email: 'coordinador@demo.local',
    nombre: 'Laura',
    apellidos: 'Soler',
    dni: '10000000A',
    telefono: '+34600000001',
    roles: [RolUsuario.COORDINADOR],
  })

  const coordinadorApoyo = await upsertUser({
    email: 'coordinador.apoyo@demo.local',
    nombre: 'Pablo',
    apellidos: 'Ramos',
    dni: '10000009J',
    telefono: '+34600000009',
    roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO, RolUsuario.COORDINADOR],
  })

  const puestoNorteAdmin = await upsertUser({
    email: 'puesto.norte@demo.local',
    nombre: 'Marta',
    apellidos: 'Responsable Norte',
    dni: '10000001B',
    telefono: '+34600000002',
    roles: [RolUsuario.PUESTO_EMERGENCIA],
  })

  const puestoSurAdmin = await upsertUser({
    email: 'puesto.sur@demo.local',
    nombre: 'Javier',
    apellidos: 'Responsable Sur',
    dni: '10000002C',
    telefono: '+34600000003',
    roles: [RolUsuario.PUESTO_EMERGENCIA],
  })

  const puestoOesteAdmin = await upsertUser({
    email: 'puesto.oeste@demo.local',
    nombre: 'Nuria',
    apellidos: 'Responsable Oeste',
    dni: '10000010K',
    telefono: '+34600000010',
    roles: [RolUsuario.PUESTO_EMERGENCIA],
  })

  const puestoEsteAdmin = await upsertUser({
    email: 'puesto.este@demo.local',
    nombre: 'Victor',
    apellidos: 'Responsable Este',
    dni: '10000011L',
    telefono: '+34600000011',
    roles: [RolUsuario.PUESTO_EMERGENCIA],
  })

  const ciudadano = await upsertUser({
    email: 'ciudadano@demo.local',
    nombre: 'Ana',
    apellidos: 'Vecina',
    dni: '10000003D',
    telefono: '+34600000004',
    roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO],
  })

  const voluntario = await upsertUser({
    email: 'voluntario@demo.local',
    nombre: 'Diego',
    apellidos: 'Fuster',
    dni: '10000004E',
    telefono: '+34600000005',
    roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO],
  })

  const voluntariaRutas = await upsertUser({
    email: 'voluntaria.rutas@demo.local',
    nombre: 'Carmen',
    apellidos: 'Mora',
    dni: '10000005F',
    telefono: '+34600000006',
    roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO],
  })

  const vecinoCatarroja = await upsertUser({
    email: 'vecino.catarroja@demo.local',
    nombre: 'Sergio',
    apellidos: 'Benavent',
    dni: '10000006G',
    telefono: '+34600000007',
    roles: [RolUsuario.CIUDADANO],
  })

  const donante = await upsertUser({
    email: 'donante@demo.local',
    nombre: 'Elena',
    apellidos: 'Dominguez',
    dni: '10000007H',
    telefono: '+34600000008',
    roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO],
  })

  const voluntarios = {
    alvaro: await ensureVoluntario(alvaro.id, 'vehiculo', { tipo: 'coche', capacidadKg: 120 }),
    coordinadorApoyo: await ensureVoluntario(coordinadorApoyo.id, 'a pie'),
    ciudadano: await ensureVoluntario(ciudadano.id, 'a pie'),
    voluntario: await ensureVoluntario(voluntario.id, 'vehiculo', { tipo: 'furgoneta', capacidadKg: 400 }),
    voluntariaRutas: await ensureVoluntario(voluntariaRutas.id, 'vehiculo', { tipo: 'todoterreno', capacidadKg: 250 }),
    donante: await ensureVoluntario(donante.id, 'vehiculo', { tipo: 'coche', capacidadKg: 80 }),
  }

  const puestos = await Promise.all([
    prisma.puestoEmergencia.upsert({
      where: { id: 'demo-puesto-norte' },
      update: {
        nombre: 'Pabellon Norte',
        descripcion: 'Recepcion principal de agua, mantas y kits familiares.',
        direccion: 'Avinguda de la Constitucio 12, Paiporta',
        latitud: 39.4314,
        longitud: -0.4184,
        tipo: 'pabellon',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 12,
        adminId: puestoNorteAdmin.id,
      },
      create: {
        id: 'demo-puesto-norte',
        nombre: 'Pabellon Norte',
        descripcion: 'Recepcion principal de agua, mantas y kits familiares.',
        direccion: 'Avinguda de la Constitucio 12, Paiporta',
        latitud: 39.4314,
        longitud: -0.4184,
        tipo: 'pabellon',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 12,
        adminId: puestoNorteAdmin.id,
      },
    }),
    prisma.puestoEmergencia.upsert({
      where: { id: 'demo-puesto-sur' },
      update: {
        nombre: 'Centro Civico Sur',
        descripcion: 'Punto de reparto de comida, higiene y material infantil.',
        direccion: 'Carrer Major 44, Catarroja',
        latitud: 39.4029,
        longitud: -0.4038,
        tipo: 'centro_civico',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 10,
        adminId: puestoSurAdmin.id,
      },
      create: {
        id: 'demo-puesto-sur',
        nombre: 'Centro Civico Sur',
        descripcion: 'Punto de reparto de comida, higiene y material infantil.',
        direccion: 'Carrer Major 44, Catarroja',
        latitud: 39.4029,
        longitud: -0.4038,
        tipo: 'centro_civico',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 10,
        adminId: puestoSurAdmin.id,
      },
    }),
    prisma.puestoEmergencia.upsert({
      where: { id: 'demo-puesto-oeste' },
      update: {
        nombre: 'Almacen Oeste',
        descripcion: 'Clasificacion de herramientas, limpieza y EPIs.',
        direccion: 'Carrer de Sant Roc 8, Albal',
        latitud: 39.3978,
        longitud: -0.4157,
        tipo: 'almacen',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 8,
        adminId: puestoOesteAdmin.id,
      },
      create: {
        id: 'demo-puesto-oeste',
        nombre: 'Almacen Oeste',
        descripcion: 'Clasificacion de herramientas, limpieza y EPIs.',
        direccion: 'Carrer de Sant Roc 8, Albal',
        latitud: 39.3978,
        longitud: -0.4157,
        tipo: 'almacen',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 8,
        adminId: puestoOesteAdmin.id,
      },
    }),
    prisma.puestoEmergencia.upsert({
      where: { id: 'demo-puesto-este' },
      update: {
        nombre: 'Colegio Este',
        descripcion: 'Atencion a familias desplazadas y recogida de medicamentos.',
        direccion: 'Carrer del Doctor Fleming 3, Benetusser',
        latitud: 39.4236,
        longitud: -0.3979,
        tipo: 'colegio',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 9,
        adminId: puestoEsteAdmin.id,
      },
      create: {
        id: 'demo-puesto-este',
        nombre: 'Colegio Este',
        descripcion: 'Atencion a familias desplazadas y recogida de medicamentos.',
        direccion: 'Carrer del Doctor Fleming 3, Benetusser',
        latitud: 39.4236,
        longitud: -0.3979,
        tipo: 'colegio',
        activo: true,
        estadoSolicitud: 'APROBADO',
        capacidadTrabajo: 9,
        adminId: puestoEsteAdmin.id,
      },
    }),
  ])

  const [puestoNorte, puestoSur, puestoOeste, puestoEste] = puestos

  const productos = {
    agua: await getOrCreateProduct('Agua embotellada', 'Bebidas', 'litros'),
    comida: await getOrCreateProduct('Alimentos no perecederos', 'Alimentacion', 'kg'),
    mantas: await getOrCreateProduct('Mantas', 'Abrigo', 'unidades'),
    higiene: await getOrCreateProduct('Productos de higiene', 'Higiene', 'kits'),
    panales: await getOrCreateProduct('Panales infantiles', 'Infancia', 'paquetes'),
    leche: await getOrCreateProduct('Leche infantil', 'Infancia', 'botes'),
    medicinas: await getOrCreateProduct('Botiquines basicos', 'Salud', 'kits'),
    guantes: await getOrCreateProduct('Guantes de trabajo', 'Herramientas', 'pares'),
    palas: await getOrCreateProduct('Palas y rastrillos', 'Herramientas', 'unidades'),
    linternas: await getOrCreateProduct('Linternas', 'Electricidad', 'unidades'),
    baterias: await getOrCreateProduct('Baterias externas', 'Electricidad', 'unidades'),
    mascarillas: await getOrCreateProduct('Mascarillas FFP2', 'Salud', 'unidades'),
  }

  await Promise.all([
    setInventory(puestoNorte.id, productos.agua.id, TipoInventario.DISPONIBLE, 420),
    setInventory(puestoNorte.id, productos.comida.id, TipoInventario.DISPONIBLE, 190),
    setInventory(puestoNorte.id, productos.mantas.id, TipoInventario.NECESARIO, 70),
    setInventory(puestoNorte.id, productos.higiene.id, TipoInventario.NECESARIO, 45),
    setInventory(puestoNorte.id, productos.guantes.id, TipoInventario.DISPONIBLE, 120),
    setInventory(puestoSur.id, productos.agua.id, TipoInventario.NECESARIO, 180),
    setInventory(puestoSur.id, productos.comida.id, TipoInventario.DISPONIBLE, 260),
    setInventory(puestoSur.id, productos.panales.id, TipoInventario.NECESARIO, 55),
    setInventory(puestoSur.id, productos.leche.id, TipoInventario.NECESARIO, 35),
    setInventory(puestoSur.id, productos.mantas.id, TipoInventario.DISPONIBLE, 48),
    setInventory(puestoOeste.id, productos.palas.id, TipoInventario.DISPONIBLE, 32),
    setInventory(puestoOeste.id, productos.guantes.id, TipoInventario.NECESARIO, 90),
    setInventory(puestoOeste.id, productos.linternas.id, TipoInventario.NECESARIO, 24),
    setInventory(puestoOeste.id, productos.baterias.id, TipoInventario.DISPONIBLE, 18),
    setInventory(puestoEste.id, productos.medicinas.id, TipoInventario.NECESARIO, 30),
    setInventory(puestoEste.id, productos.mascarillas.id, TipoInventario.DISPONIBLE, 300),
    setInventory(puestoEste.id, productos.higiene.id, TipoInventario.DISPONIBLE, 64),
    setInventory(puestoEste.id, productos.leche.id, TipoInventario.DISPONIBLE, 22),
  ])

  await Promise.all([
    prisma.puestoTrabajador.upsert({
      where: { puestoId_usuarioId: { puestoId: puestoNorte.id, usuarioId: coordinadorApoyo.id } },
      update: { addedBy: puestoNorteAdmin.id },
      create: { puestoId: puestoNorte.id, usuarioId: coordinadorApoyo.id, addedBy: puestoNorteAdmin.id },
    }),
    prisma.puestoTrabajador.upsert({
      where: { puestoId_usuarioId: { puestoId: puestoSur.id, usuarioId: ciudadano.id } },
      update: { addedBy: puestoSurAdmin.id },
      create: { puestoId: puestoSur.id, usuarioId: ciudadano.id, addedBy: puestoSurAdmin.id },
    }),
    prisma.puestoTrabajador.upsert({
      where: { puestoId_usuarioId: { puestoId: puestoOeste.id, usuarioId: voluntario.id } },
      update: { addedBy: puestoOesteAdmin.id },
      create: { puestoId: puestoOeste.id, usuarioId: voluntario.id, addedBy: puestoOesteAdmin.id },
    }),
  ])

  const incidencias = await Promise.all([
    prisma.incidenciaVia.upsert({
      where: { id: 'demo-incidencia-1' },
      update: {
        estado: EstadoVia.CORTADA,
        titulo: 'Paso inferior inundado',
        categoria: 'inundacion',
        descripcion: 'Agua acumulada en el paso inferior. Evitar la zona.',
        latitud: 39.4212,
        longitud: -0.4122,
        reportanteId: ciudadano.id,
      },
      create: {
        id: 'demo-incidencia-1',
        estado: EstadoVia.CORTADA,
        titulo: 'Paso inferior inundado',
        categoria: 'inundacion',
        descripcion: 'Agua acumulada en el paso inferior. Evitar la zona.',
        latitud: 39.4212,
        longitud: -0.4122,
        reportanteId: ciudadano.id,
      },
    }),
    prisma.incidenciaVia.upsert({
      where: { id: 'demo-incidencia-2' },
      update: {
        estado: EstadoVia.TRANSITABLE,
        titulo: 'Escombros retirados',
        categoria: 'limpieza',
        descripcion: 'La calle vuelve a estar transitable con precaucion.',
        latitud: 39.4148,
        longitud: -0.3987,
        reportanteId: ciudadano.id,
      },
      create: {
        id: 'demo-incidencia-2',
        estado: EstadoVia.TRANSITABLE,
        titulo: 'Escombros retirados',
        categoria: 'limpieza',
        descripcion: 'La calle vuelve a estar transitable con precaucion.',
        latitud: 39.4148,
        longitud: -0.3987,
        reportanteId: ciudadano.id,
      },
    }),
    prisma.incidenciaVia.upsert({
      where: { id: 'demo-incidencia-3' },
      update: {
        estado: EstadoVia.CORTADA,
        titulo: 'Puente con barro denso',
        categoria: 'barro',
        descripcion: 'Acumulacion de lodo. Necesita limpieza con palas y EPIs.',
        latitud: 39.4081,
        longitud: -0.4244,
        reportanteId: vecinoCatarroja.id,
      },
      create: {
        id: 'demo-incidencia-3',
        estado: EstadoVia.CORTADA,
        titulo: 'Puente con barro denso',
        categoria: 'barro',
        descripcion: 'Acumulacion de lodo. Necesita limpieza con palas y EPIs.',
        latitud: 39.4081,
        longitud: -0.4244,
        reportanteId: vecinoCatarroja.id,
      },
    }),
    prisma.incidenciaVia.upsert({
      where: { id: 'demo-incidencia-4' },
      update: {
        estado: EstadoVia.TRANSITABLE,
        titulo: 'Ruta alternativa habilitada',
        categoria: 'trafico',
        descripcion: 'Paso lento para vehiculos pequenos por la via de servicio.',
        latitud: 39.4173,
        longitud: -0.3881,
        reportanteId: voluntariaRutas.id,
      },
      create: {
        id: 'demo-incidencia-4',
        estado: EstadoVia.TRANSITABLE,
        titulo: 'Ruta alternativa habilitada',
        categoria: 'trafico',
        descripcion: 'Paso lento para vehiculos pequenos por la via de servicio.',
        latitud: 39.4173,
        longitud: -0.3881,
        reportanteId: voluntariaRutas.id,
      },
    }),
  ])

  await Promise.all([
    prisma.comentarioIncidenciaVia.upsert({
      where: { id: 'demo-comentario-1' },
      update: { estado: EstadoVia.CORTADA, comentario: 'Proteccion Civil mantiene el corte preventivo.', autorId: coordinador.id },
      create: {
        id: 'demo-comentario-1',
        incidenciaId: incidencias[0].id,
        estado: EstadoVia.CORTADA,
        comentario: 'Proteccion Civil mantiene el corte preventivo.',
        autorId: coordinador.id,
      },
    }),
    prisma.comentarioIncidenciaVia.upsert({
      where: { id: 'demo-comentario-2' },
      update: { estado: EstadoVia.TRANSITABLE, comentario: 'Retirada parcial completada. Circular despacio.', autorId: voluntariaRutas.id },
      create: {
        id: 'demo-comentario-2',
        incidenciaId: incidencias[1].id,
        estado: EstadoVia.TRANSITABLE,
        comentario: 'Retirada parcial completada. Circular despacio.',
        autorId: voluntariaRutas.id,
      },
    }),
    prisma.comentarioIncidenciaVia.upsert({
      where: { id: 'demo-comentario-3' },
      update: { estado: EstadoVia.CORTADA, comentario: 'Se asignan dos voluntarios para revisar accesos.', autorId: alvaro.id },
      create: {
        id: 'demo-comentario-3',
        incidenciaId: incidencias[2].id,
        estado: EstadoVia.CORTADA,
        comentario: 'Se asignan dos voluntarios para revisar accesos.',
        autorId: alvaro.id,
      },
    }),
  ])

  await Promise.all([
    prisma.donacion.upsert({
      where: { id: 'demo-donacion-pendiente' },
      update: {
        estado: EstadoDonacion.PENDIENTE,
        cantidad: 50,
        unidad: 'litros',
        productoId: productos.agua.id,
        puestoId: puestoSur.id,
        voluntarioId: voluntarios.donante.id,
        comentario: 'Disponible para recoger esta tarde.',
        eta: null,
      },
      create: {
        id: 'demo-donacion-pendiente',
        estado: EstadoDonacion.PENDIENTE,
        cantidad: 50,
        unidad: 'litros',
        productoId: productos.agua.id,
        puestoId: puestoSur.id,
        voluntarioId: voluntarios.donante.id,
        comentario: 'Disponible para recoger esta tarde.',
      },
    }),
    prisma.donacion.upsert({
      where: { id: 'demo-donacion-camino' },
      update: {
        estado: EstadoDonacion.EN_CAMINO,
        cantidad: 20,
        unidad: 'unidades',
        productoId: productos.mantas.id,
        puestoId: puestoNorte.id,
        voluntarioId: voluntarios.voluntario.id,
        comentario: 'Entrega demo en camino.',
        eta: new Date(Date.now() + 45 * 60 * 1000),
        entregaCodigo: 'DEMO-CODIGO-MANTAS',
        entregaCodigoGeneradoAt: new Date(),
      },
      create: {
        id: 'demo-donacion-camino',
        estado: EstadoDonacion.EN_CAMINO,
        cantidad: 20,
        unidad: 'unidades',
        productoId: productos.mantas.id,
        puestoId: puestoNorte.id,
        voluntarioId: voluntarios.voluntario.id,
        comentario: 'Entrega demo en camino.',
        eta: new Date(Date.now() + 45 * 60 * 1000),
        entregaCodigo: 'DEMO-CODIGO-MANTAS',
        entregaCodigoGeneradoAt: new Date(),
      },
    }),
    prisma.donacion.upsert({
      where: { id: 'demo-donacion-entregada' },
      update: {
        estado: EstadoDonacion.ENTREGADA,
        cantidad: 15,
        unidad: 'kits',
        productoId: productos.higiene.id,
        puestoId: puestoEste.id,
        voluntarioId: voluntarios.alvaro.id,
        comentario: 'Entrega confirmada por el puesto.',
        eta: new Date(Date.now() - 2 * 60 * 60 * 1000),
        entregaCodigo: 'DEMO-CODIGO-HIGIENE',
        entregaCodigoGeneradoAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      create: {
        id: 'demo-donacion-entregada',
        estado: EstadoDonacion.ENTREGADA,
        cantidad: 15,
        unidad: 'kits',
        productoId: productos.higiene.id,
        puestoId: puestoEste.id,
        voluntarioId: voluntarios.alvaro.id,
        comentario: 'Entrega confirmada por el puesto.',
        eta: new Date(Date.now() - 2 * 60 * 60 * 1000),
        entregaCodigo: 'DEMO-CODIGO-HIGIENE',
        entregaCodigoGeneradoAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    }),
    prisma.donacion.upsert({
      where: { id: 'demo-donacion-cancelada' },
      update: {
        estado: EstadoDonacion.CANCELADA,
        cantidad: 10,
        unidad: 'unidades',
        productoId: productos.linternas.id,
        puestoId: puestoOeste.id,
        voluntarioId: voluntarios.coordinadorApoyo.id,
        comentario: 'Cancelada por duplicidad con otro envio.',
      },
      create: {
        id: 'demo-donacion-cancelada',
        estado: EstadoDonacion.CANCELADA,
        cantidad: 10,
        unidad: 'unidades',
        productoId: productos.linternas.id,
        puestoId: puestoOeste.id,
        voluntarioId: voluntarios.coordinadorApoyo.id,
        comentario: 'Cancelada por duplicidad con otro envio.',
      },
    }),
  ])

  await Promise.all([
    prisma.solicitudPuesto.upsert({
      where: { id: 'demo-solicitud-puesto-pendiente' },
      update: {
        usuarioId: vecinoCatarroja.id,
        nombre: 'Asociacion Vecinal Catarroja',
        descripcion: 'Propuesta de punto de recogida temporal en local vecinal.',
        direccion: 'Carrer Nou 15, Catarroja',
        latitud: 39.4052,
        longitud: -0.4065,
        tipo: 'local_vecinal',
        estado: EstadoSolicitudPuesto.PENDIENTE,
        coordinadorId: null,
        motivoRechazo: null,
        decidedAt: null,
      },
      create: {
        id: 'demo-solicitud-puesto-pendiente',
        usuarioId: vecinoCatarroja.id,
        nombre: 'Asociacion Vecinal Catarroja',
        descripcion: 'Propuesta de punto de recogida temporal en local vecinal.',
        direccion: 'Carrer Nou 15, Catarroja',
        latitud: 39.4052,
        longitud: -0.4065,
        tipo: 'local_vecinal',
        estado: EstadoSolicitudPuesto.PENDIENTE,
      },
    }),
    prisma.solicitudPuesto.upsert({
      where: { id: 'demo-solicitud-puesto-aceptada' },
      update: {
        usuarioId: donante.id,
        coordinadorId: coordinador.id,
        nombre: 'Nave Solidaria Massanassa',
        descripcion: 'Nave con espacio para clasificar material pesado.',
        direccion: 'Carrer del Poligon 7, Massanassa',
        latitud: 39.411,
        longitud: -0.382,
        tipo: 'nave',
        estado: EstadoSolicitudPuesto.ACEPTADA,
        motivoRechazo: null,
        decidedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      create: {
        id: 'demo-solicitud-puesto-aceptada',
        usuarioId: donante.id,
        coordinadorId: coordinador.id,
        nombre: 'Nave Solidaria Massanassa',
        descripcion: 'Nave con espacio para clasificar material pesado.',
        direccion: 'Carrer del Poligon 7, Massanassa',
        latitud: 39.411,
        longitud: -0.382,
        tipo: 'nave',
        estado: EstadoSolicitudPuesto.ACEPTADA,
        decidedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    }),
    prisma.solicitudPuesto.upsert({
      where: { id: 'demo-solicitud-puesto-rechazada' },
      update: {
        usuarioId: ciudadano.id,
        coordinadorId: coordinador.id,
        nombre: 'Garage particular',
        descripcion: 'Espacio demasiado pequeno para recepcion de material.',
        direccion: 'Carrer Llarg 4, Paiporta',
        latitud: 39.427,
        longitud: -0.419,
        tipo: 'garage',
        estado: EstadoSolicitudPuesto.RECHAZADA,
        motivoRechazo: 'No cumple capacidad minima ni acceso para vehiculos.',
        decidedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      create: {
        id: 'demo-solicitud-puesto-rechazada',
        usuarioId: ciudadano.id,
        coordinadorId: coordinador.id,
        nombre: 'Garage particular',
        descripcion: 'Espacio demasiado pequeno para recepcion de material.',
        direccion: 'Carrer Llarg 4, Paiporta',
        latitud: 39.427,
        longitud: -0.419,
        tipo: 'garage',
        estado: EstadoSolicitudPuesto.RECHAZADA,
        motivoRechazo: 'No cumple capacidad minima ni acceso para vehiculos.',
        decidedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    }),
  ])

  await Promise.all([
    prisma.solicitudParticipacionPuesto.upsert({
      where: { id: 'demo-participacion-pendiente' },
      update: {
        puestoId: puestoNorte.id,
        usuarioId: voluntariaRutas.id,
        estado: EstadoSolicitudParticipacionPuesto.PENDIENTE,
        responsableId: null,
        motivoRechazo: null,
        decidedAt: null,
      },
      create: {
        id: 'demo-participacion-pendiente',
        puestoId: puestoNorte.id,
        usuarioId: voluntariaRutas.id,
        estado: EstadoSolicitudParticipacionPuesto.PENDIENTE,
      },
    }),
    prisma.solicitudParticipacionPuesto.upsert({
      where: { id: 'demo-participacion-aceptada' },
      update: {
        puestoId: puestoSur.id,
        usuarioId: ciudadano.id,
        estado: EstadoSolicitudParticipacionPuesto.ACEPTADA,
        responsableId: puestoSurAdmin.id,
        motivoRechazo: null,
        decidedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      create: {
        id: 'demo-participacion-aceptada',
        puestoId: puestoSur.id,
        usuarioId: ciudadano.id,
        estado: EstadoSolicitudParticipacionPuesto.ACEPTADA,
        responsableId: puestoSurAdmin.id,
        decidedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
    }),
    prisma.solicitudParticipacionPuesto.upsert({
      where: { id: 'demo-participacion-rechazada' },
      update: {
        puestoId: puestoEste.id,
        usuarioId: vecinoCatarroja.id,
        estado: EstadoSolicitudParticipacionPuesto.RECHAZADA,
        responsableId: puestoEsteAdmin.id,
        motivoRechazo: 'El usuario no tiene rol de voluntario activo.',
        decidedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
      create: {
        id: 'demo-participacion-rechazada',
        puestoId: puestoEste.id,
        usuarioId: vecinoCatarroja.id,
        estado: EstadoSolicitudParticipacionPuesto.RECHAZADA,
        responsableId: puestoEsteAdmin.id,
        motivoRechazo: 'El usuario no tiene rol de voluntario activo.',
        decidedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
    }),
  ])

  await Promise.all([
    prisma.asignacionPuesto.upsert({
      where: { id: 'demo-asignacion-puesto-activa' },
      update: { voluntarioId: voluntarios.voluntariaRutas.id, puestoId: puestoNorte.id, estado: EstadoAsignacionPuesto.ACTIVA, endedAt: null },
      create: {
        id: 'demo-asignacion-puesto-activa',
        voluntarioId: voluntarios.voluntariaRutas.id,
        puestoId: puestoNorte.id,
        estado: EstadoAsignacionPuesto.ACTIVA,
      },
    }),
    prisma.asignacionPuesto.upsert({
      where: { id: 'demo-asignacion-puesto-finalizada' },
      update: {
        voluntarioId: voluntarios.donante.id,
        puestoId: puestoSur.id,
        estado: EstadoAsignacionPuesto.FINALIZADA,
        endedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      create: {
        id: 'demo-asignacion-puesto-finalizada',
        voluntarioId: voluntarios.donante.id,
        puestoId: puestoSur.id,
        estado: EstadoAsignacionPuesto.FINALIZADA,
        endedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    }),
    prisma.asignacionIncidencia.upsert({
      where: { id: 'demo-asignacion-incidencia-activa' },
      update: { voluntarioId: voluntarios.voluntario.id, incidenciaId: incidencias[2].id, estado: EstadoAsignacionIncidencia.ACTIVA, endedAt: null },
      create: {
        id: 'demo-asignacion-incidencia-activa',
        voluntarioId: voluntarios.voluntario.id,
        incidenciaId: incidencias[2].id,
        estado: EstadoAsignacionIncidencia.ACTIVA,
      },
    }),
    prisma.asignacionIncidencia.upsert({
      where: { id: 'demo-asignacion-incidencia-finalizada' },
      update: {
        voluntarioId: voluntarios.coordinadorApoyo.id,
        incidenciaId: incidencias[1].id,
        estado: EstadoAsignacionIncidencia.FINALIZADA,
        endedAt: new Date(Date.now() - 90 * 60 * 1000),
      },
      create: {
        id: 'demo-asignacion-incidencia-finalizada',
        voluntarioId: voluntarios.coordinadorApoyo.id,
        incidenciaId: incidencias[1].id,
        estado: EstadoAsignacionIncidencia.FINALIZADA,
        endedAt: new Date(Date.now() - 90 * 60 * 1000),
      },
    }),
  ])

  await Promise.all([
    upsertAuditLog({
      id: 'demo-audit-seed',
      usuarioId: coordinador.id,
      accion: 'SEED_DEMO',
      entidad: 'SISTEMA',
      entidadId: 'demo',
      datos: { mensaje: 'Datos demo completos actualizados' },
    }),
    upsertAuditLog({
      id: 'demo-audit-inventario',
      usuarioId: puestoNorteAdmin.id,
      accion: 'INVENTARIO_ACTUALIZADO',
      entidad: 'PUESTO',
      entidadId: puestoNorte.id,
      datos: { producto: 'Agua embotellada', cantidad: 420 },
    }),
    upsertAuditLog({
      id: 'demo-audit-donacion',
      usuarioId: alvaro.id,
      accion: 'DONACION_ENTREGADA',
      entidad: 'DONACION',
      entidadId: 'demo-donacion-entregada',
      datos: { estado: EstadoDonacion.ENTREGADA },
    }),
  ])

  console.log('Datos demo completos creados o actualizados.')
  console.log('Credenciales demo: Demo12345')
  console.log('coordinador@demo.local, coordinador.apoyo@demo.local')
  console.log('puesto.norte@demo.local, puesto.sur@demo.local, puesto.oeste@demo.local, puesto.este@demo.local')
  console.log('ciudadano@demo.local, voluntario@demo.local, voluntaria.rutas@demo.local, donante@demo.local')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
