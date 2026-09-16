"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Trash2, Search, ShieldAlert, FileSearch, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PreviewProduct {
    id: string;
    name: string;
    barcode: string;
    stock: number;
    created_at: string | null;
    reasons: string[];
}

interface PreviewData {
    products_to_delete: PreviewProduct[];
    total_products: number;
    total_to_delete: number;
    reasons_summary: Record<string, number>;
    orphan_locations: { id: string; name: string; path: string }[];
    warning: string;
}

const reasonLabels: Record<string, string> = {
    zero_stock: "Stock 0",
    never_sold: "Nunca vendido",
    unused: "Sin movimiento",
    rollback_import: "De importación",
};

export function PurgePage() {
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [daysUnused, setDaysUnused] = useState(30);
    const [includeOrphanLocations, setIncludeOrphanLocations] = useState(false);
    const [rollbackMode, setRollbackMode] = useState(false);
    const [createdAfter, setCreatedAfter] = useState("");
    const [search, setSearch] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [myCompanyName, setMyCompanyName] = useState("");
    const [countdown, setCountdown] = useState(0);
    const [showConfirm, setShowConfirm] = useState(false);
    const [result, setResult] = useState<{ deleted_products: number; deleted_locations: number } | null>(null);

    // Cargar nombre de la empresa actual
    useEffect(() => {
        api.get("/companies/me")
            .then(res => setMyCompanyName(res.data?.name || ""))
            .catch(() => {});
    }, []);

    // Countdown de 5 segundos para habilitar el botón
    useEffect(() => {
        if (countdown <= 0) return;
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown]);

    const loadPreview = useCallback(async () => {
        setLoading(true);
        setResult(null);
        try {
            let url = `/inventory/purge/preview?days_unused=${daysUnused}`;
            if (rollbackMode && createdAfter) {
                url += `&created_after=${createdAfter}`;
            }
            const res = await api.get(url);
            setPreview(res.data);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Error cargando preview");
        } finally {
            setLoading(false);
        }
    }, [daysUnused, rollbackMode, createdAfter]);

    const executePurge = async () => {
        setExecuting(true);
        try {
            const res = await api.post("/inventory/purge/execute", {
                confirm_company_name: companyName,
                days_unused: daysUnused,
                include_zero_stock: true,
                include_never_sold: true,
                include_orphan_locations: includeOrphanLocations,
                created_after: rollbackMode && createdAfter ? createdAfter : null,
            });
            toast.success(res.data?.message || "Depuración completada");
            setResult({
                deleted_products: res.data.deleted_products,
                deleted_locations: res.data.deleted_locations || 0,
            });
            setShowConfirm(false);
            setCompanyName("");
            setCountdown(0);
            loadPreview();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Error ejecutando depuración");
        } finally {
            setExecuting(false);
        }
    };

    const filtered = preview?.products_to_delete.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(search.toLowerCase())
    ) || [];

    const nameMatches = companyName.trim() === myCompanyName.trim() && myCompanyName !== "";

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-red-500" />
                        Depuración de Inventario
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Elimina productos obsoletos de <strong>{myCompanyName || "tu empresa"}</strong>. Solo afecta tu empresa. Esta acción es irreversible.
                    </p>
                </div>
            </div>

            {/* Criterios */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">
                            Sin movimientos por (días)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={daysUnused}
                            onChange={e => setDaysUnused(Number(e.target.value) || 30)}
                            disabled={rollbackMode}
                            className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-40"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rollbackMode}
                            onChange={e => setRollbackMode(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <span className="font-semibold text-red-600">Deshacer importación Excel</span>
                    </label>
                    {rollbackMode && (
                        <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">
                                Productos creados desde
                            </label>
                            <input
                                type="date"
                                value={createdAfter}
                                onChange={e => setCreatedAfter(e.target.value)}
                                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            />
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeOrphanLocations}
                            onChange={e => setIncludeOrphanLocations(e.target.checked)}
                            className="h-4 w-4"
                        />
                        Incluir ubicaciones huérfanas
                    </label>
                    <Button
                        onClick={loadPreview}
                        disabled={loading || (rollbackMode && !createdAfter)}
                        className="gap-2"
                    >
                        <FileSearch className="h-4 w-4" />
                        {loading ? "Analizando..." : "Analizar (dry-run)"}
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                    {rollbackMode ? (
                        <>
                            <strong className="text-red-600">Modo rollback:</strong> elimina todos los productos creados
                            desde la fecha indicada que <strong>nunca se hayan vendido</strong>, aunque tengan stock.
                            Los que ya se vendieron se conservan.
                        </>
                    ) : (
                        <>
                            Criterio: productos con <strong>stock 0</strong> Y que además <strong>nunca se han vendido</strong> o <strong>no tienen movimientos</strong> en el período.
                        </>
                    )}
                </p>
            </div>

            {/* Resultado de ejecución */}
            {result && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-5 flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                            Depuración completada
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                            {result.deleted_products} productos y {result.deleted_locations} ubicaciones eliminados. Snapshot guardado en el audit log.
                        </p>
                    </div>
                </div>
            )}

            {/* Preview */}
            {preview && (
                <>
                    {/* Resumen */}
                    <div className={cn(
                        "rounded-2xl border p-5",
                        preview.total_to_delete > 0
                            ? "border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30"
                            : "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30"
                    )}>
                        <div className="flex items-center gap-3">
                            <AlertTriangle className={cn("h-6 w-6 shrink-0", preview.total_to_delete > 0 ? "text-red-600" : "text-emerald-600")} />
                            <div className="flex-1">
                                {preview.total_to_delete > 0 ? (
                                    <>
                                        <p className="text-sm font-bold text-red-800 dark:text-red-300">
                                            Se eliminarían {preview.total_to_delete} de {preview.total_products} productos
                                        </p>
                                        <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                                            {Object.entries(preview.reasons_summary)
                                                .filter(([, v]) => v > 0)
                                                .map(([k, v]) => `${v} ${reasonLabels[k] || k}`)
                                                .join(" · ")}
                                            {includeOrphanLocations && preview.orphan_locations.length > 0 &&
                                                ` · ${preview.orphan_locations.length} ubicaciones huérfanas`}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                                        ✅ Nada que depurar — todo tu inventario está en uso
                                    </p>
                                )}
                            </div>
                            {preview.total_to_delete > 0 && (
                                <Button
                                    variant="destructive"
                                    onClick={() => { setShowConfirm(true); setCountdown(5); }}
                                    className="gap-2 shrink-0"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Depurar
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Tabla de productos */}
                    {preview.total_to_delete > 0 && (
                        <div className="rounded-2xl border border-border bg-card overflow-hidden">
                            <div className="flex items-center gap-3 p-4 border-b border-border">
                                <Search className="h-4 w-4 text-muted-foreground" />
                                <input
                                    placeholder="Buscar producto a eliminar..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-sm outline-none"
                                />
                                <span className="text-xs text-muted-foreground">{filtered.length} productos</span>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/50 sticky top-0">
                                        <tr>
                                            <th className="text-left p-3 font-bold">Producto</th>
                                            <th className="text-left p-3 font-bold">Barcode</th>
                                            <th className="text-center p-3 font-bold">Stock</th>
                                            <th className="text-left p-3 font-bold">Razones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(p => (
                                            <tr key={p.id} className="border-t border-border/50">
                                                <td className="p-3 font-medium">{p.name}</td>
                                                <td className="p-3 text-muted-foreground">{p.barcode}</td>
                                                <td className="p-3 text-center text-red-600 font-bold">{p.stock}</td>
                                                <td className="p-3">
                                                    <div className="flex gap-1 flex-wrap">
                                                        {p.reasons.map(r => (
                                                            <span key={r} className="text-[10px] bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-semibold">
                                                                {reasonLabels[r] || r}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modal de confirmación estilo GitHub */}
            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-500/30 bg-card shadow-2xl overflow-hidden">
                        <div className="bg-red-500 p-5">
                            <h3 className="text-base font-black text-white flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" />
                                Confirmar depuración irreversible
                            </h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Estás por eliminar <strong className="text-red-600">{preview?.total_to_delete} productos</strong>
                                {includeOrphanLocations && preview?.orphan_locations?.length ? ` y ${preview.orphan_locations.length} ubicaciones` : ""} de <strong>{myCompanyName}</strong>.
                                Se guardará un snapshot en el audit log, pero la acción <strong>NO se puede deshacer</strong>.
                            </p>
                            <div>
                                <label className="text-xs font-bold uppercase text-muted-foreground block mb-2">
                                    Escribe el nombre de la empresa para confirmar:
                                </label>
                                <input
                                    autoFocus
                                    value={companyName}
                                    onChange={e => setCompanyName(e.target.value)}
                                    placeholder={myCompanyName}
                                    className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 text-sm font-mono focus:border-red-400 outline-none"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="outline" onClick={() => { setShowConfirm(false); setCompanyName(""); setCountdown(0); }}>
                                    Cancelar
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={!nameMatches || countdown > 0 || executing}
                                    onClick={executePurge}
                                    className="gap-2"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {countdown > 0 ? `Espera ${countdown}s...` : executing ? "Ejecutando..." : "Eliminar definitivamente"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
