import { PrismaClient, TipoInventario } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Buscar un responsable para asignar como administrador del puesto de prueba
  const admin = await prisma.usuario.findFirst({
    where: { roles: { has: 'PUESTO_EMERGENCIA' } }
  })
  if (!admin) {
    console.error('No se encontró ningún usuario con rol PUESTO_EMERGENCIA')
    return
  }

  // 1. Crear Puesto Oeste en Albal (39.3950, -0.4150)
  const puestoOeste = await prisma.puestoEmergencia.upsert({
    where: { id: 'demo-puesto-oeste' },
    update: {
      nombre: 'Polideportivo Municipal Albal',
      direccion: 'Carrer de l’Esport 5, Albal',
      latitud: 39.3950,
      longitud: -0.4150,
      tipo: 'pabellon',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 10,
      adminId: admin.id,
    },
    create: {
      id: 'demo-puesto-oeste',
      nombre: 'Polideportivo Municipal Albal',
      direccion: 'Carrer de l’Esport 5, Albal',
      latitud: 39.3950,
      longitud: -0.4150,
      tipo: 'pabellon',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 10,
      adminId: admin.id,
    }
  })

  // 2. Crear Puesto Este en Benetússer (39.4230, -0.3980)
  const puestoEste = await prisma.puestoEmergencia.upsert({
    where: { id: 'demo-puesto-este' },
    update: {
      nombre: 'Centro Cultural El Moli Benetusser',
      direccion: 'Carrer Nou 18, Benetusser',
      latitud: 39.4230,
      longitud: -0.3980,
      tipo: 'centro_civico',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 5,
      adminId: admin.id,
    },
    create: {
      id: 'demo-puesto-este',
      nombre: 'Centro Cultural El Moli Benetusser',
      direccion: 'Carrer Nou 18, Benetusser',
      latitud: 39.4230,
      longitud: -0.3980,
      tipo: 'centro_civico',
      activo: true,
      estadoSolicitud: 'APROBADO',
      capacidadTrabajo: 5,
      adminId: admin.id,
    }
  })

  // Obtener los productos estándar de la base de datos
  const agua = await prisma.producto.findFirst({ where: { nombre: { contains: 'Agua', mode: 'insensitive' } } })
  const mantas = await prisma.producto.findFirst({ where: { nombre: { contains: 'Mantas', mode: 'insensitive' } } })
  const higiene = await prisma.producto.findFirst({ where: { nombre: { contains: 'higiene', mode: 'insensitive' } } })

  if (agua && mantas && higiene) {
    // Cargar necesidades para el puesto de Albal
    await prisma.inventario.upsert({
      where: { puestoId_productoId_tipo: { puestoId: puestoOeste.id, productoId: agua.id, tipo: TipoInventario.NECESARIO } },
      update: { cantidad: 50 },
      create: { puestoId: puestoOeste.id, productoId: agua.id, tipo: TipoInventario.NECESARIO, cantidad: 50 }
    })
    await prisma.inventario.upsert({
      where: { puestoId_productoId_tipo: { puestoId: puestoOeste.id, productoId: mantas.id, tipo: TipoInventario.NECESARIO } },
      update: { cantidad: 30 },
      create: { puestoId: puestoOeste.id, productoId: mantas.id, tipo: TipoInventario.NECESARIO, cantidad: 30 }
    })

    // Cargar necesidades para el puesto de Benetússer
    await prisma.inventario.upsert({
      where: { puestoId_productoId_tipo: { puestoId: puestoEste.id, productoId: higiene.id, tipo: TipoInventario.NECESARIO } },
      update: { cantidad: 45 },
      create: { puestoId: puestoEste.id, productoId: higiene.id, tipo: TipoInventario.NECESARIO, cantidad: 45 }
    })
    await prisma.inventario.upsert({
      where: { puestoId_productoId_tipo: { puestoId: puestoEste.id, productoId: agua.id, tipo: TipoInventario.NECESARIO } },
      update: { cantidad: 75 },
      create: { puestoId: puestoEste.id, productoId: agua.id, tipo: TipoInventario.NECESARIO, cantidad: 75 }
    })

    console.log('Necesidades registradas correctamente en los nuevos puestos de prueba.')
  } else {
    console.warn('Productos base (Agua, Mantas, Higiene) no encontrados. Asegúrate de ejecutar el seed primero con `npm run db:seed`.')
  }

  console.log('Puestos de prueba adicionales de Albal y Benetússer creados correctamente.')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
