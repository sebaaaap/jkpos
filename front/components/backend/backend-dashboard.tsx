import {
  Monitor,
  ShoppingCart,
  Package,
  Settings,
  Users,
  BarChart3,
  Wrench,
  ChevronRight,
  LogOut,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { BranchSelector } from "@/components/shared/BranchSelector"
import { NotificationBell } from "@/components/shared/NotificationBell"
import { useSettings } from "@/hooks/useSettings"
import { useRouter } from "next/navigation"

export type ModuleId = "pdv" | "compras" | "inventario" | "ajustes" | "reportes" | "clientes" | "taller"

interface BackendDashboardProps {
  onNavigate: (module: ModuleId) => void
}

const modulesConfig = [
  {
    id: "pdv" as ModuleId,
    name: "Punto de Venta",
    description: "Caja registradora para ventas directas a clientes y cobros veloces",
    icon: Monitor,
    color: "bg-primary text-primary-foreground",
    badge: "Abierto",
    roles: ["admin", "vendedor"],
  },
  {
    id: "compras" as ModuleId,
    name: "Compras",
    description: "Gestión de órdenes de compra, entrada de productos y proveedores",
    icon: ShoppingCart,
    color: "bg-secondary text-secondary-foreground",
    badge: "",
    roles: ["admin"],
  },
  {
    id: "inventario" as ModuleId,
    name: "Inventario",
    description: "Control de stock, movimientos, ajustes y catálogo de repuestos",
    icon: Package,
    color: "bg-amber-600 text-white",
    badge: "",
    roles: ["admin"],
  },
]

const workshopConfig = [
  {
    id: "taller" as ModuleId,
    name: "Taller Automotriz",
    description: "Gestión de cotizaciones, órdenes de trabajo, repuestos e historial vehicular",
    icon: Wrench,
    color: "bg-[#eb1914] text-white",
    roles: ["admin"],
  }
]

const quickLinksConfig = [
  { label: "Clientes", icon: Users, description: "Gestionar clientes y vehículos asociados", roles: ["admin"] },
  { label: "Reportes", icon: BarChart3, description: "Estadísticas de ventas, compras e inventario", roles: ["admin"] },
  { label: "Configuracion", icon: Settings, description: "Ajustes generales e información del negocio", roles: ["admin"] },
]

export function BackendDashboard({ onNavigate }: BackendDashboardProps) {
  const { user, logout, isAdmin } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  const filteredModules = modulesConfig.filter(m => user && m.roles.includes(user.role));
  const filteredQuickLinks = quickLinksConfig.filter(l => user && l.roles.includes(user.role));
  const filteredWorkshop = workshopConfig.filter(w => user && w.roles.includes(user.role));

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Bar Ampliado y Destacado */}
      <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          {settings.logoBase64 ? (
            <img 
              src={settings.logoBase64} 
              alt="Logo Taller" 
              className="h-12 w-auto max-w-[180px] object-contain drop-shadow-sm"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eb1914] shadow-md shadow-[#eb1914]/20">
              <Wrench className="h-6 w-6 text-white" />
            </div>
          )}
          <div className="border-l border-border/60 pl-4">
            <h1 className="text-xl font-black text-foreground leading-tight tracking-tight">VKI</h1>
            <p className="text-xs font-semibold text-muted-foreground">Sistema de Gestión — Talleres Mecánicos</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 border-r border-border/60 pr-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm text-foreground leading-none">{user?.full_name || user?.username}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                {user?.role === 'admin' ? 'Administrador' : 'Vendedor'}
              </span>
            </div>
          </div>

          <NotificationBell />

          <div className="border-r border-border/60 pr-5">
            <BranchSelector />
          </div>

          <button
            onClick={() => confirm('¿Desea cerrar sesión?') && logout()}
            className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors px-3 py-2 rounded-xl hover:bg-destructive/10 border border-transparent hover:border-destructive/20"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Main Content — Ampliado max-w-6xl */}
      <div className="flex-1 overflow-auto p-8 md:p-10">
        <div className="mx-auto max-w-6xl">
          {/* Welcome Header */}
          <div className="mb-10">
            <h2 className="text-3xl font-black tracking-tight text-foreground text-balance">Panel de Control</h2>
            <p className="mt-1.5 text-base font-medium text-muted-foreground">
              {isAdmin
                ? "Selecciona un módulo para comenzar a trabajar"
                : "Bienvenido, selecciona una de tus herramientas permitidas"}
            </p>
          </div>

          {/* Módulos Principales — Tarjetas más grandes */}
          <div className={`grid grid-cols-1 gap-6 ${filteredModules.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'} mb-10`}>
            {filteredModules.map((mod) => {
              const Icon = mod.icon
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onNavigate(mod.id)}
                  className="group flex flex-col rounded-3xl border-2 border-border/70 bg-card p-7 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 hover:-translate-y-1 active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-md ${mod.color}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    {mod.badge && (
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        ● {mod.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2 group-hover:text-primary transition-colors">{mod.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 font-medium">
                    {mod.description}
                  </p>
                  <div className="mt-auto flex items-center gap-2 text-xs font-bold text-primary group-hover:translate-x-1 transition-transform">
                    <span>Abrir módulo</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Seccion Taller */}
          {filteredWorkshop.length > 0 && (
            <div className="mb-10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Taller y Servicios</h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {filteredWorkshop.map((mod) => {
                  const Icon = mod.icon
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => onNavigate(mod.id)}
                      className="group flex flex-col rounded-3xl border-2 border-border/70 bg-card p-6 text-left transition-all duration-300 hover:shadow-xl hover:shadow-[#eb1914]/10 hover:border-[#eb1914]/40 hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex items-center gap-5 mb-4">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-md ${mod.color}`}>
                          <Icon className="h-7 w-7" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-foreground group-hover:text-[#eb1914] transition-colors">{mod.name}</h3>
                          <p className="text-xs font-medium text-muted-foreground mt-1 leading-relaxed">
                            {mod.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center gap-2 text-xs font-bold text-[#eb1914] group-hover:translate-x-1 transition-transform pt-2">
                        <span>Gestionar Órdenes y Cotizaciones</span>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Accesos Rápidos */}
          {filteredQuickLinks.length > 0 && (
            <div className="mb-10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Accesos Rápidos</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {filteredQuickLinks.map((link) => {
                  const Icon = link.icon
                  return (
                    <button
                      key={link.label}
                      onClick={() => {
                        if (link.label === "Configuracion") {
                          onNavigate("ajustes" as any)
                        } else if (link.label === "Reportes") {
                          onNavigate("reportes")
                        } else if (link.label === "Clientes") {
                          onNavigate("clientes" as any)
                        }
                      }}
                      className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all duration-200 hover:bg-muted/60 hover:border-primary/30 hover:shadow-md cursor-pointer w-full group"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted border border-border/50 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{link.label}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">{link.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="mt-16 mb-6 text-center text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.25em]">
          Powered by VankaiLabs
        </div>
      </div>
    </div>
  )
}

