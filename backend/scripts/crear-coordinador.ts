import bcrypt from 'bcryptjs'
import { PrismaClient, RolUsuario } from '@prisma/client'

const prisma = new PrismaClient()

const EMAIL    = 'coordinador@admin.com'
const PASSWORD = 'Admin1234!'
const NOMBRE   = 'Coordinador'
const APELLIDOS = 'Principal'
const DNI      = '00000000T'

async function main() {
  const exists = await prisma.usuario.findUnique({ where: { email: EMAIL } })
  if (exists) {
    console.log(`⚠️  Ya existe un usuario con email ${EMAIL}`)
    console.log(`   Roles: ${exists.roles.join(', ')}`)
    return
  }

  const hashed = await bcrypt.hash(PASSWORD, 12)

  const user = await prisma.usuario.create({
    data: {
      email: EMAIL,
      password: hashed,
      nombre: NOMBRE,
      apellidos: APELLIDOS,
      dni: DNI,
      roles: [RolUsuario.COORDINADOR],
      activo: true,
    },
  })

  console.log('✅ Coordinador creado correctamente')
  console.log(`   Email:      ${user.email}`)
  console.log(`   Contraseña: ${PASSWORD}`)
  console.log(`   Rol:        ${user.roles.join(', ')}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
