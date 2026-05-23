import bcrypt from 'bcryptjs'
import { PrismaClient, RolUsuario, TipoInventario } from '@prisma/client'

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

async function getOrCreateProduct(nombre: string, categoria: string, unidad: string) {
  const existing = await prisma.producto.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, unidad: { equals: unidad, mode: 'insensitive' } },
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

async function main() {
  password = await bcrypt.hash('Demo12345', 12)

  const coordinador = await upsertUser({
    email: 'coordinador@demo.local',
    nombre: 'Laura',
    apellidos: 'Coordinadora',
    dni: '10000000A',
    telefono: '+34600000001',
    roles: [RolUsuario.COORDINADOR],
  })

  const responsableNorte = await upsertUser({
    email: 'puesto.norte@demo.local',
    nombre: 'Marta',
    apellidos: 'Responsable Norte',
    dni: '10000001B',
    telefono: '+34600000002',
    roles: [RolUsuario.PUESTO_EMERGENCIA],
  })

  const responsableSur = await upsertUser({
    email: 'puesto.sur@demo.local',
    nombre: 'Javier',
    apellidos: 'Responsable Sur',
    dni: '10000002C',
    telefono: '+34600000003',
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
    apellidos: 'Voluntario',
    dni: '10000004E',
    telefono: '+34600000005',
    roles: [RolUsuario.CIUDADANO, RolUsuario.VOLUNTARIO],
  })

  await prisma.voluntario.upsert({
    where: { usuarioId: voluntario.id },
    update: { modalidad: 'vehiculo', vehiculo: { tipo: 'furgoneta', capacidadKg: 400 } },
    create: { usuarioId: voluntario.id, modalidad: 'vehiculo', vehiculo: { tipo: 'furgoneta', capacidadKg: 400 } },
  })
  await prisma.voluntario.upsert({
    where: { usuarioId: ciudadano.id },
    update: { modalidad: 'a pie' },
    create: { usuarioId: ciudadano.id, modalidad: 'a pie' },
  })

  const puestoNorte = await prisma.puestoEmergencia.upsert({
    where: { id: 'demo-puesto-norte' },
    update: {
      nombre: 'Pabellon Norte',
      direccion: 'Avinguda de la Constitucio 12, Paiporta',
      latitud: 39.4314,
      longitud: -0.4184,
      tipo: 'pabellon',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 8,
      adminId: responsableNorte.id,
    },
    create: {
      id: 'demo-puesto-norte',
      nombre: 'Pabellon Norte',
      direccion: 'Avinguda de la Constitucio 12, Paiporta',
      latitud: 39.4314,
      longitud: -0.4184,
      tipo: 'pabellon',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 8,
      adminId: responsableNorte.id,
    },
  })

  const puestoSur = await prisma.puestoEmergencia.upsert({
    where: { id: 'demo-puesto-sur' },
    update: {
      nombre: 'Centro Civico Sur',
      direccion: 'Carrer Major 44, Catarroja',
      latitud: 39.4029,
      longitud: -0.4038,
      tipo: 'centro_civico',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 6,
      adminId: responsableSur.id,
    },
    create: {
      id: 'demo-puesto-sur',
      nombre: 'Centro Civico Sur',
      direccion: 'Carrer Major 44, Catarroja',
      latitud: 39.4029,
      longitud: -0.4038,
      tipo: 'centro_civico',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 6,
      adminId: responsableSur.id,
    },
  })

  const agua = await getOrCreateProduct('Agua embotellada', 'Bebidas', 'litros')
  const mantas = await getOrCreateProduct('Mantas', 'Abrigo', 'unidades')
  const higiene = await getOrCreateProduct('Productos de higiene', 'Higiene', 'kits')
  const comida = await getOrCreateProduct('Alimentos no perecederos', 'Alimentacion', 'kg')
  const guantes = await getOrCreateProduct('Guantes de trabajo', 'Herramientas', 'pares')

  await setInventory(puestoNorte.id, agua.id, TipoInventario.DISPONIBLE, 120)
  await setInventory(puestoNorte.id, mantas.id, TipoInventario.NECESARIO, 40)
  await setInventory(puestoNorte.id, higiene.id, TipoInventario.NECESARIO, 25)
  await setInventory(puestoNorte.id, guantes.id, TipoInventario.DISPONIBLE, 15)
  await setInventory(puestoSur.id, comida.id, TipoInventario.DISPONIBLE, 80)
  await setInventory(puestoSur.id, agua.id, TipoInventario.NECESARIO, 60)
  await setInventory(puestoSur.id, mantas.id, TipoInventario.DISPONIBLE, 12)

  await prisma.incidenciaVia.upsert({
    where: { id: 'demo-incidencia-1' },
    update: {
      estado: 'CORTADA',
      titulo: 'Paso inferior inundado',
      categoria: 'inundacion',
      descripcion: 'Agua acumulada en el paso inferior. Evitar la zona.',
      latitud: 39.4212,
      longitud: -0.4122,
      reportanteId: ciudadano.id,
    },
    create: {
      id: 'demo-incidencia-1',
      estado: 'CORTADA',
      titulo: 'Paso inferior inundado',
      categoria: 'inundacion',
      descripcion: 'Agua acumulada en el paso inferior. Evitar la zona.',
      latitud: 39.4212,
      longitud: -0.4122,
      reportanteId: ciudadano.id,
    },
  })

  await prisma.incidenciaVia.upsert({
    where: { id: 'demo-incidencia-2' },
    update: {
      estado: 'TRANSITABLE',
      titulo: 'Escombros retirados',
      categoria: 'limpieza',
      descripcion: 'La calle vuelve a estar transitable con precaucion.',
      latitud: 39.4148,
      longitud: -0.3987,
      reportanteId: ciudadano.id,
    },
    create: {
      id: 'demo-incidencia-2',
      estado: 'TRANSITABLE',
      titulo: 'Escombros retirados',
      categoria: 'limpieza',
      descripcion: 'La calle vuelve a estar transitable con precaucion.',
      latitud: 39.4148,
      longitud: -0.3987,
      reportanteId: ciudadano.id,
    },
  })

  const voluntarioPerfil = await prisma.voluntario.findUniqueOrThrow({ where: { usuarioId: voluntario.id } })
  await prisma.donacion.upsert({
    where: { id: 'demo-donacion-camino' },
    update: {
      estado: 'EN_CAMINO',
      cantidad: 20,
      unidad: 'unidades',
      productoId: mantas.id,
      puestoId: puestoNorte.id,
      voluntarioId: voluntarioPerfil.id,
      comentario: 'Entrega demo en camino',
      eta: new Date(Date.now() + 45 * 60 * 1000),
      entregaCodigo: 'DEMO-CODIGO-MANTAS',
      entregaCodigoGeneradoAt: new Date(),
    },
    create: {
      id: 'demo-donacion-camino',
      estado: 'EN_CAMINO',
      cantidad: 20,
      unidad: 'unidades',
      productoId: mantas.id,
      puestoId: puestoNorte.id,
      voluntarioId: voluntarioPerfil.id,
      comentario: 'Entrega demo en camino',
      eta: new Date(Date.now() + 45 * 60 * 1000),
      entregaCodigo: 'DEMO-CODIGO-MANTAS',
      entregaCodigoGeneradoAt: new Date(),
    },
  })

  await prisma.auditLog.create({
    data: {
      usuarioId: coordinador.id,
      accion: 'SEED_DEMO',
      entidad: 'SISTEMA',
      entidadId: 'demo',
      datos: { mensaje: 'Datos demo actualizados' },
    },
  })

  console.log('Datos demo creados.')
  console.log('Credenciales: coordinador@demo.local / Demo12345')
  console.log('Credenciales: voluntario@demo.local / Demo12345')
  console.log('Credenciales: puesto.norte@demo.local / Demo12345')
  console.log('Credenciales: ciudadano@demo.local / Demo12345')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
