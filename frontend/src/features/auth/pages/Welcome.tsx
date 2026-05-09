import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_ROUTES } from '@/types/auth.types'

export default function Welcome() {
  const navigate = useNavigate()
  const { isAuthenticated, selectedRole } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return
    if (selectedRole) {
      navigate(ROLE_ROUTES[selectedRole], { replace: true })
    } else {
      navigate('/seleccionar-rol', { replace: true })
    }
  }, [isAuthenticated, selectedRole, navigate])

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full">

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-blue-600 text-white text-4xl mb-5 shadow-lg">
            🆘
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Catástrofe Logística</h1>
          <p className="mt-2 text-gray-500 text-sm leading-relaxed">
            Coordinación de ayuda humanitaria en emergencias
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/auth/register')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3.5 text-sm transition-colors shadow-sm"
          >
            Registrarse
          </button>
          <button
            onClick={() => navigate('/auth/login')}
            className="w-full bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-xl py-3.5 text-sm transition-colors shadow-sm border border-gray-200"
          >
            Iniciar sesión
          </button>
        </div>

        <div className="mt-8 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <span className="text-base flex-shrink-0">📵</span>
          <p className="text-xs text-gray-500 leading-relaxed">
            La aplicación funciona <strong>sin conexión</strong>. Los datos se sincronizan automáticamente cuando recuperes el internet.
          </p>
        </div>
      </div>
    </div>
  )
}
