import { PrismaClient, TipoInventario } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find Puesto Norte Admin
  const admin = await prisma.usuario.findFirst({
    where: {
      email: 'puesto.norte@demo.local',
    },
  })

  if (!admin) {
    console.error('❌ No se encontró el usuario puesto.norte@demo.local')
    process.exit(1)
  }

  // Find Puesto Norte
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: {
      id: 'demo-puesto-norte',
    },
  })

  if (!puesto) {
    console.error('❌ No se encontró el puesto demo-puesto-norte')
    process.exit(1)
  }

  // Clean old audit logs for the puesto (optional, but ensures clean state)
  await prisma.auditLog.deleteMany({
    where: {
      entidad: 'PUESTO_INVENTARIO',
      entidadId: puesto.id,
    },
  })

  const now = new Date()
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  // Insert 5 audit log movements for the history view
  await prisma.auditLog.createMany({
    data: [
      {
        usuarioId: admin.id,
        accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA',
        entidad: 'PUESTO_INVENTARIO',
        entidadId: puesto.id,
        createdAt: fiveMinAgo,
        datos: {
          producto: { nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' },
          tipo: TipoInventario.DISPONIBLE,
          cantidadAnterior: 430,
          cantidadNueva: 420,
          delta: -10,
        },
      },
      {
        usuarioId: admin.id,
        accion: 'QR_DONACION_CONFIRMADA',
        entidad: 'PUESTO_INVENTARIO',
        entidadId: puesto.id,
        createdAt: oneHourAgo,
        datos: {
          producto: { nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' },
          tipo: TipoInventario.DISPONIBLE,
          cantidadAnterior: 320,
          cantidadNueva: 430,
          delta: 110,
        },
      },
      {
        usuarioId: admin.id,
        accion: 'INVENTARIO_ACTUALIZADO',
        entidad: 'PUESTO_INVENTARIO',
        entidadId: puesto.id,
        createdAt: threeHoursAgo,
        datos: {
          producto: { nombre: 'Mantas', categoria: 'Abrigo', unidad: 'unidades' },
          tipo: TipoInventario.NECESARIO,
          cantidadAnterior: 100,
          cantidadNueva: 70,
          delta: -30,
        },
      },
      {
        usuarioId: admin.id,
        accion: 'INVENTARIO_INCREMENTADO',
        entidad: 'PUESTO_INVENTARIO',
        entidadId: puesto.id,
        createdAt: oneDayAgo,
        datos: {
          producto: { nombre: 'Alimentos no perecederos', categoria: 'Alimentacion', unidad: 'kg' },
          tipo: TipoInventario.DISPONIBLE,
          cantidadAnterior: 90,
          cantidadNueva: 190,
          delta: 100,
        },
      },
      {
        usuarioId: admin.id,
        accion: 'INVENTARIO_CREADO',
        entidad: 'PUESTO_INVENTARIO',
        entidadId: puesto.id,
        createdAt: twoDaysAgo,
        datos: {
          producto: { nombre: 'Guantes de trabajo', categoria: 'Herramientas', unidad: 'pares' },
          tipo: TipoInventario.DISPONIBLE,
          cantidadAnterior: 0,
          cantidadNueva: 120,
          delta: 120,
        },
      },
    ],
  })

  console.log('✅ 5 movimientos de inventario agregados con éxito para Pabellon Norte.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
