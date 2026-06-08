import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { ROLE_ROUTES, type User } from '@/types/auth.types'

interface VehiculoPerfil {
  disponible: boolean
  tipo?: string
  matricula?: string
  capacidad?: string
}

interface VoluntarioPerfil {
  id: string
  modalidad?: string | null
  vehiculo?: VehiculoPerfil | null
  verificado: boolean
}

function parseError(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
    ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? fallback
}

function validateNameField(value: string, label: string) {
  const trimmed = value.trim()
  if (trimmed.length < 2) return `${label} debe tener al menos 2 caracteres.`
  if (trimmed.length > 60) return `${label} no puede superar 60 caracteres.`
  return null
}

function validatePhone(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/[\s-]/g, '')
  if (!/^(?:\+34)?[6789][0-9]{8}$/.test(normalized)) {
    return 'Introduce un telefono espanol valido.'
  }

  return null
}

function validateVehicleField(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return `${label} es obligatorio si tienes vehiculo disponible.`
  if (trimmed.length > 40) return `${label} no puede superar 40 caracteres.`
  return null
}

function StatusRow({ label, ready, value }: { label: string; ready: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{label}</p>
        <p className="truncate text-xs text-slate-500">{value}</p>
      </div>
      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${ready ? 'bg-green-500' : 'bg-amber-500'}`} />
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { selectedRole, user, updateUser } = useAuthStore()
  const [personal, setPersonal] = useState({
    nombre: user?.nombre ?? '',
    apellidos: user?.apellidos ?? '',
    telefono: user?.telefono ?? '',
  })
  const [voluntario, setVoluntario] = useState({
    modalidad: 'mixta',
    vehiculoDisponible: false,
    tipoVehiculo: '',
    matricula: '',
    capacidad: '',
  })
  const [personalErrors, setPersonalErrors] = useState<{ nombre?: string; apellidos?: string; telefono?: string }>({})
  const [voluntarioErrors, setVoluntarioErrors] = useState<{ tipoVehiculo?: string; matricula?: string; capacidad?: string }>({})
  const [message, setMessage] = useState('')

  const userQuery = useQuery({
    queryKey: ['perfil-usuario'],
    queryFn: () => apiClient.get<{ user: User; createdAt?: string }>('/api/users/me').then((r) => r.data),
  })

  const voluntarioQuery = useQuery({
    queryKey: ['perfil-voluntario'],
    queryFn: () => apiClient.get<{ voluntario: VoluntarioPerfil }>('/api/voluntarios/me').then((r) => r.data.voluntario),
  })

  useEffect(() => {
    if (!userQuery.data?.user) return
    const current = userQuery.data.user
    setPersonal({
      nombre: current.nombre,
      apellidos: current.apellidos,
      telefono: current.telefono ?? '',
    })
    updateUser(current)
  }, [updateUser, userQuery.data?.user])

  useEffect(() => {
    if (!voluntarioQuery.data) return
    const vehiculo = voluntarioQuery.data.vehiculo
    setVoluntario({
      modalidad: voluntarioQuery.data.modalidad ?? 'mixta',
      vehiculoDisponible: Boolean(vehiculo?.disponible),
      tipoVehiculo: vehiculo?.tipo ?? '',
      matricula: vehiculo?.matricula ?? '',
      capacidad: vehiculo?.capacidad ?? '',
    })
  }, [voluntarioQuery.data])

  const savePersonal = useMutation({
    mutationFn: () => apiClient.patch<{ user: User }>('/api/users/me', {
      nombre: personal.nombre,
      apellidos: personal.apellidos,
      telefono: personal.telefono || null,
    }),
    onSuccess: (response) => {
      updateUser(response.data.user)
      setPersonalErrors({})
      setMessage('Datos personales actualizados')
    },
    onError: (err) => setMessage(parseError(err, 'No se pudieron guardar los datos personales')),
  })

  const saveVoluntario = useMutation({
    mutationFn: () => apiClient.patch<{ voluntario: VoluntarioPerfil }>('/api/voluntarios/me', {
      modalidad: voluntario.modalidad,
      vehiculo: {
        disponible: voluntario.vehiculoDisponible,
        tipo: voluntario.tipoVehiculo || null,
        matricula: voluntario.matricula || null,
        capacidad: voluntario.capacidad || null,
      },
    }),
    onSuccess: () => {
      setVoluntarioErrors({})
      setMessage('Preferencias operativas actualizadas')
    },
    onError: (err) => setMessage(parseError(err, 'No se pudieron guardar las preferencias')),
  })

  const handleSavePersonal = () => {
    const nextErrors = {
      nombre: validateNameField(personal.nombre, 'El nombre') ?? undefined,
      apellidos: validateNameField(personal.apellidos, 'Los apellidos') ?? undefined,
      telefono: validatePhone(personal.telefono) ?? undefined,
    }

    setPersonalErrors(nextErrors)
    setMessage('')

    if (Object.values(nextErrors).some(Boolean)) return
    savePersonal.mutate()
  }

  const handleSaveVoluntario = () => {
    const nextErrors: { tipoVehiculo?: string; matricula?: string; capacidad?: string } = {}

    if (voluntario.vehiculoDisponible) {
      nextErrors.tipoVehiculo = validateVehicleField(voluntario.tipoVehiculo, 'El tipo de vehiculo') ?? undefined
      nextErrors.matricula = validateVehicleField(voluntario.matricula, 'La matricula o identificador') ?? undefined

      const capacidad = voluntario.capacidad.trim()
      if (capacidad && capacidad.length > 40) {
        nextErrors.capacidad = 'La capacidad no puede superar 40 caracteres.'
      }
    }

    setVoluntarioErrors(nextErrors)
    setMessage('')

    if (Object.values(nextErrors).some(Boolean)) return
    saveVoluntario.mutate()
  }

  const createdAt = userQuery.data?.createdAt
    ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(userQuery.data.createdAt))
    : null
  const activeUser = userQuery.data?.user ?? user
  const roles = activeUser?.roles ?? []
  const hasPhone = Boolean(personal.telefono.trim())
  const hasVehicle = voluntario.vehiculoDisponible
  const hasVehicleData = !hasVehicle || Boolean(voluntario.tipoVehiculo.trim() && voluntario.matricula.trim())
  const completion = [true, hasPhone, hasVehicleData].filter(Boolean).length
  const readinessLabel = completion === 3 ? 'Perfil listo' : 'Completar datos'
  const handleExitProfile = () => {
    navigate(selectedRole ? ROLE_ROUTES[selectedRole] : '/')
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <section className="min-w-0 space-y-4">
        <div className="border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Perfil operativo</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">Datos de intervencion</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Informacion minima para identificarte, contactar contigo y asignarte tareas durante una emergencia.
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleExitProfile}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Volver
              </button>
              <Badge variant={completion === 3 ? 'success' : 'warning'}>{readinessLabel}</Badge>
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identidad</p>
              <h2 className="text-lg font-semibold text-slate-950">Contacto principal</h2>
            </div>
            {createdAt && <p className="text-xs text-slate-500">Alta: {createdAt}</p>}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleSavePersonal()
            }}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label className="block text-sm font-medium text-slate-700">
              Nombre
              <input
                value={personal.nombre}
                onChange={(event) => setPersonal((prev) => ({ ...prev, nombre: event.target.value }))}
                minLength={2}
                maxLength={60}
                autoComplete="given-name"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {personalErrors.nombre && <span className="mt-1 block text-xs font-medium text-red-600">{personalErrors.nombre}</span>}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Apellidos
              <input
                value={personal.apellidos}
                onChange={(event) => setPersonal((prev) => ({ ...prev, apellidos: event.target.value }))}
                minLength={2}
                maxLength={60}
                autoComplete="family-name"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {personalErrors.apellidos && <span className="mt-1 block text-xs font-medium text-red-600">{personalErrors.apellidos}</span>}
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Telefono operativo
              <input
                value={personal.telefono}
                onChange={(event) => setPersonal((prev) => ({ ...prev, telefono: event.target.value }))}
                placeholder="+34 600 000 000"
                inputMode="tel"
                autoComplete="tel"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {personalErrors.telefono && <span className="mt-1 block text-xs font-medium text-red-600">{personalErrors.telefono}</span>}
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" loading={savePersonal.isPending}>Guardar contacto</Button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Capacidad</p>
            <h2 className="text-lg font-semibold text-slate-950">Disponibilidad para apoyo</h2>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleSaveVoluntario()
            }}
            className="mt-4 space-y-3"
          >
            <label className="block text-sm font-medium text-slate-700">
              Modalidad preferida
              <select
                value={voluntario.modalidad}
                onChange={(event) => setVoluntario((prev) => ({ ...prev, modalidad: event.target.value }))}
                aria-label="Modalidad preferida"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
              >
                <option value="mixta">Mixta</option>
                <option value="transporte">Transporte</option>
                <option value="presencial">Trabajo presencial</option>
                <option value="donaciones">Donaciones</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              Vehiculo disponible
              <input
                type="checkbox"
                checked={voluntario.vehiculoDisponible}
                onChange={(event) => setVoluntario((prev) => ({ ...prev, vehiculoDisponible: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
              />
            </label>

            {voluntario.vehiculoDisponible && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium text-slate-700">
                  Tipo
                  <input
                    value={voluntario.tipoVehiculo}
                    onChange={(event) => setVoluntario((prev) => ({ ...prev, tipoVehiculo: event.target.value }))}
                    placeholder="Furgoneta"
                    maxLength={40}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                  {voluntarioErrors.tipoVehiculo && <span className="mt-1 block text-xs font-medium text-red-600">{voluntarioErrors.tipoVehiculo}</span>}
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Matricula
                  <input
                    value={voluntario.matricula}
                    onChange={(event) => setVoluntario((prev) => ({ ...prev, matricula: event.target.value }))}
                    placeholder="0000 ABC"
                    maxLength={40}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                  {voluntarioErrors.matricula && <span className="mt-1 block text-xs font-medium text-red-600">{voluntarioErrors.matricula}</span>}
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Capacidad
                  <input
                    value={voluntario.capacidad}
                    onChange={(event) => setVoluntario((prev) => ({ ...prev, capacidad: event.target.value }))}
                    placeholder="4 cajas / 3 plazas"
                    maxLength={40}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                  {voluntarioErrors.capacidad && <span className="mt-1 block text-xs font-medium text-red-600">{voluntarioErrors.capacidad}</span>}
                </label>
              </div>
            )}

            <Button type="submit" loading={saveVoluntario.isPending} className="bg-green-700 hover:bg-green-800">
              Guardar capacidad
            </Button>
          </form>
        </section>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</p>
            <h2 className="text-lg font-semibold text-slate-950">{readinessLabel}</h2>
          </div>
          <span className="text-sm font-semibold text-slate-700">{completion}/3</span>
        </div>

        <div className="mt-4">
          <StatusRow label="Identidad" ready value={`${personal.nombre || 'Nombre'} ${personal.apellidos || ''}`.trim()} />
          <StatusRow label="Telefono" ready={hasPhone} value={hasPhone ? personal.telefono : 'Necesario para coordinacion'} />
          <StatusRow label="Vehiculo" ready={hasVehicleData} value={hasVehicle ? `${voluntario.tipoVehiculo || 'Vehiculo'} - ${voluntario.matricula || 'sin matricula'}` : 'No disponible'} />
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roles</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {roles.length > 0 ? roles.map((role) => (
              <Badge key={role} variant="info">{role}</Badge>
            )) : (
              <Badge>Sin rol</Badge>
            )}
          </div>
        </div>

        {message && (
          <p className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            message.includes('No se') ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
          }`}>
            {message}
          </p>
        )}
      </aside>
    </div>
  )
}
