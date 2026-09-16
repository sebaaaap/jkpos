"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, Package, User, MapPin, Wallet, Mail, AlertTriangle, LogIn, ShoppingCart } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface Notification {
    id: string;
    user_id: string;
    user_name: string | null;
    action: string;
    entity_type: string | null;
    company_name?: string | null;
    description: string;
    severity: "info" | "action" | "warning" | "critical";
    is_read: boolean;
    created_at: string;
    metadata?: any;
}

const severityConfig = {
    critical: { icon: AlertTriangle, dot: "bg-red-500", text: "text-red-600", pulse: true },
    warning: { icon: AlertTriangle, dot: "bg-amber-500", text: "text-amber-600", pulse: false },
    action: { icon: Package, dot: "bg-blue-500", text: "text-blue-600", pulse: false },
    info: { icon: Check, dot: "bg-slate-400", text: "text-slate-500", pulse: false },
};

function iconFor(notif: Notification) {
    const a = notif.action || "";
    if (a.startsWith("product.moved") || a.startsWith("location.")) return MapPin;
    if (a.startsWith("user.")) return User;
    if (a.startsWith("cash.")) return Wallet;
    if (a.startsWith("email.")) return Mail;
    if (a.startsWith("user.login")) return LogIn;
    if (a.startsWith("stock.low")) return AlertTriangle;
    if (a.startsWith("purchase.")) return ShoppingCart;
    return Package;
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
}

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = async () => {
        try {
            const res = await api.get("/notifications?days=7&limit=30");
            setNotifications(res.data?.notifications || []);
            setUnread(res.data?.unread_count || 0);
        } catch {
            // silencioso
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000); // poll cada 60s
        return () => clearInterval(interval);
    }, []);

    // Cerrar al hacer click fuera
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const markAllRead = async () => {
        try {
            await api.post("/notifications/read-all");
            setUnread(0);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch { /* noop */ }
    };

    const markOneRead = async (id: string) => {
        try {
            await api.post(`/notifications/${id}/read`);
            setUnread(u => Math.max(0, u - 1));
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch { /* noop */ }
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Botón campanita */}
            <button
                onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
                aria-label="Notificaciones"
            >
                <Bell className={cn("h-4 w-4", unread > 0 ? "text-primary" : "text-muted-foreground")} />
                {unread > 0 && (
                    <span className={cn(
                        "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                        notifications.some(n => n.severity === "critical" && !n.is_read)
                            ? "bg-red-500 animate-pulse"
                            : "bg-primary"
                    )}>
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>

            {/* Panel desplegable */}
            {open && (
                <div className="absolute right-0 top-11 z-50 w-96 max-h-[480px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                    {/* Header del panel */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold">Notificaciones</h3>
                            <span className="text-[10px] text-muted-foreground">últimos 7 días</span>
                        </div>
                        {unread > 0 && (
                            <button
                                onClick={markAllRead}
                                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                                <Check className="h-3 w-3" />
                                Marcar leídas
                            </button>
                        )}
                    </div>

                    {/* Feed estilo git-log */}
                    <div className="overflow-y-auto max-h-[420px]">
                        {loading && <div className="p-4 text-xs text-muted-foreground text-center">Cargando...</div>}

                        {!loading && notifications.length === 0 && (
                            <div className="p-8 text-center text-xs text-muted-foreground">
                                Sin actividad esta semana
                            </div>
                        )}

                        {notifications.map((n) => {
                            const Icon = iconFor(n);
                            const sev = severityConfig[n.severity] || severityConfig.action;
                            return (
                                <div
                                    key={n.id}
                                    className={cn(
                                        "flex gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors",
                                        !n.is_read ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
                                    )}
                                >
                                    {/* Timeline estilo git */}
                                    <div className="flex flex-col items-center">
                                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-card", sev.dot)}>
                                            <Icon className={cn("h-3.5 w-3.5 text-white")} />
                                        </div>
                                        <div className="w-px flex-1 bg-border mt-1" />
                                    </div>

                                    {/* Contenido */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className={cn(
                                                "text-xs leading-relaxed",
                                                n.severity === "critical" ? "text-red-600 font-semibold" : "text-foreground",
                                                !n.is_read && "font-medium"
                                            )}>
                                                {n.description}
                                            </p>
                                            {!n.is_read && (
                                                <button
                                                    onClick={() => markOneRead(n.id)}
                                                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                                    title="Marcar como leída"
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {n.company_name && (
                                                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                                    {n.company_name}
                                                </span>
                                            )}
                                            <span className="text-[10px] text-muted-foreground">
                                                {n.user_name || n.user_id}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">·</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {timeAgo(n.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
