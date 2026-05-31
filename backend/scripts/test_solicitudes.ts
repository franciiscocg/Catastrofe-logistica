import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const res = await prisma.solicitudParticipacionPuesto.findMany({
      take: 1,
      include: {
        puesto: {
          select: {
            id: true,
            nombre: true,
            direccion: true,
            latitud: true,
            longitud: true,
            tipo: true,
            activo: true,
          },
        },
      },
    })
    console.log('SUCCESS:', res)
  } catch (error) {
    console.error('DATABASE_ERROR_DIAGNOSTICS:', error)
  }
}

main().finally(() => prisma.$disconnect())
