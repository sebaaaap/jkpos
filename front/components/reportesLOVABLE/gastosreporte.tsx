"use client";

import React, { useState } from "react";
import {
    Receipt, DollarSign, CreditCard, Banknote, Download,
    TrendingDown, Calendar, Search, Filter, User, Monitor,
    Building2, RefreshCcw, Layers, ArrowUpRight
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, AreaChart, Area
} from "recharts";
import useSWR from "swr";
import { apiService } from "@/services/apiService";
import api from "@/lib/api";

const fmtCurrency = (n: number) =>
    n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });

const toDateStr = (d: Date) => d.toISOString().split("T")[0];

const DATE_PRESETS = [
    {
        label: "Hoy",
        getRange: () => {
            const today = toDateStr(new Date());
            return { from: today, to: today };
        },
    },
    {
        label: "Ayer",
        getRange: () => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            const s = toDateStr(d);
            return { from: s, to: s };
        },
    },
    {
        label: "7 días",
        getRange: () => {
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - 6);
            return { from: toDateStr(from), to: toDateStr(to) };
        },
    },
    {
        label: "1 mes",
        getRange: () => {
            const to = new Date();
            const from = new Date();
            from.setMonth(from.getMonth() - 1);
            return { from: toDateStr(from), to: toDateStr(to) };
        },
    },
    {
        label: "3 meses",
        getRange: () => {
            const to = new Date();
            const from = new Date();
            from.setMonth(from.getMonth() - 3);
            return { from: toDateStr(from), to: toDateStr(to) };
        },
    },
];

export default function ExpensesReport() {
    const todayStr = toDateStr(new Date());
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = toDateStr(thirtyDaysAgo);

    const [dateFrom, setDateFrom] = useState<string>(thirtyDaysAgoStr);
    const [dateTo, setDateTo] = useState<string>(todayStr);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [selectedMethod, setSelectedMethod] = useState<string>("all");
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [activePreset, setActivePreset] = useState<string>("1 mes");

    // Fetch expense categories for filter dropdown
    const { data: categories } = useSWR("/api/v1/expenses/categories", async () => {
        try {
            const res = await api.get("/expenses/categories");
            return res.data;
        } catch {
            return [];
        }
    });

    // Fetch report data
    const { data, error, isLoading, mutate } = useSWR(
        ["/reports/expenses/summary", dateFrom, dateTo, selectedCategory, selectedMethod, selectedBranch],
        () => apiService.getReportExpenses(dateFrom, dateTo, selectedCategory, selectedMethod, selectedBranch),
        { revalidateOnFocus: false }
    );

    const handlePresetClick = (preset: typeof DATE_PRESETS[0]) => {
        const { from, to } = preset.getRange();
        setDateFrom(from);
        setDateTo(to);
        setActivePreset(preset.label);
    };

    const handleExport = async () => {
        try {
            await apiService.exportExpensesExcel(dateFrom, dateTo, selectedCategory, selectedMethod, selectedBranch);
        } catch (e) {
            console.error("Error al exportar gastos a Excel", e);
        }
    };

    const kpis = data?.kpis || { total_expenses: 0, total_count: 0, avg_expense: 0, top_category: "—" };
    const chartData = data?.chart_data || [];
    const categoryChartData = data?.category_chart_data || [];
    const methodChartData = data?.method_chart_data || [];
    const expensesList = data?.expenses || [];

    const filteredExpenses = expensesList.filter((e: any) =>
        e.glosa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.category_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.cash_register.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header / Filtros */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-card p-6 rounded-3xl border border-border shadow-sm">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-full border border-red-100 text-[10px] font-bold uppercase tracking-wider mb-2">
                        <Receipt size={12} />
                        Módulo de Egresos & Compras Rápidas
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        Reporte de Gastos
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Auditoría financiera de salidas de dinero registradas desde el PDV y terminales.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Presets Rápidos */}
                    <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
                        {DATE_PRESETS.map((p) => (
                            <button
                                key={p.label}
                                onClick={() => handlePresetClick(p)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    activePreset === p.label
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Fecha Desde / Hasta */}
                    <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl border border-border">
                        <Calendar size={14} className="text-muted-foreground ml-1" />
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setActivePreset("");
                            }}
                            className="h-8 w-32 text-xs bg-background border-none shadow-none"
                        />
                        <span className="text-xs text-muted-foreground">-</span>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => {
                                setDateTo(e.target.value);
                                setActivePreset("");
                            }}
                            className="h-8 w-32 text-xs bg-background border-none shadow-none"
                        />
                    </div>

                    {/* Filtro Categoría */}
                    <div className="w-40">
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Todas las categorías" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las categorías</SelectItem>
                                {categories?.map((cat: any) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Filtro Método Pago */}
                    <div className="w-36">
                        <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Todo método" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los métodos</SelectItem>
                                <SelectItem value="efectivo">Efectivo</SelectItem>
                                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                <SelectItem value="transferencia">Transferencia</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Botón Exportar */}
                    <Button
                        onClick={handleExport}
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 font-bold text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    >
                        <Download size={14} />
                        Exportar Excel
                    </Button>
                </div>
            </div>

            {/* Tarjetas KPI */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <Card className="p-6 rounded-3xl border border-border shadow-sm bg-card hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Total Gastado
                        </span>
                        <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                            <TrendingDown size={20} />
                        </div>
                    </div>
                    {isLoading ? (
                        <Skeleton className="h-8 w-32" />
                    ) : (
                        <div>
                            <div className="text-2xl font-extrabold text-foreground tracking-tight">
                                {fmtCurrency(kpis.total_expenses)}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                                Total de egresos en el período
                            </p>
                        </div>
                    )}
                </Card>

                <Card className="p-6 rounded-3xl border border-border shadow-sm bg-card hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Nº de Registros
                        </span>
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Receipt size={20} />
                        </div>
                    </div>
                    {isLoading ? (
                        <Skeleton className="h-8 w-24" />
                    ) : (
                        <div>
                            <div className="text-2xl font-extrabold text-foreground tracking-tight">
                                {kpis.total_count} <span className="text-xs font-normal text-muted-foreground">gastos</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                                Transacciones realizadas
                            </p>
                        </div>
                    )}
                </Card>

                <Card className="p-6 rounded-3xl border border-border shadow-sm bg-card hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Gasto Promedio
                        </span>
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <DollarSign size={20} />
                        </div>
                    </div>
                    {isLoading ? (
                        <Skeleton className="h-8 w-28" />
                    ) : (
                        <div>
                            <div className="text-2xl font-extrabold text-foreground tracking-tight">
                                {fmtCurrency(kpis.avg_expense)}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                                Promedio por egreso
                            </p>
                        </div>
                    )}
                </Card>

                <Card className="p-6 rounded-3xl border border-border shadow-sm bg-card hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Categoría Mayor
                        </span>
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Layers size={20} />
                        </div>
                    </div>
                    {isLoading ? (
                        <Skeleton className="h-8 w-32" />
                    ) : (
                        <div>
                            <div className="text-xl font-bold text-foreground truncate" title={kpis.top_category}>
                                {kpis.top_category}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                                Mayor acumulación de gasto
                            </p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Gráficos de Gastos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tendencia Temporal */}
                <Card className="lg:col-span-2 p-6 rounded-3xl border border-border shadow-sm bg-card flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="font-bold text-foreground text-sm">Evolución de Gastos en el Tiempo</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Egresos acumulados día a día</p>
                        </div>
                    </div>
                    <div className="h-72 w-full">
                        {isLoading ? (
                            <Skeleton className="h-full w-full rounded-2xl" />
                        ) : chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorGasto" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                    <Tooltip
                                        formatter={(val: any) => [fmtCurrency(Number(val)), "Monto Gasto"]}
                                        contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="monto" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorGasto)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                                <Receipt size={36} className="mb-2" />
                                <p className="text-xs font-bold">Sin datos para el período</p>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Gastos por Categoría */}
                <Card className="p-6 rounded-3xl border border-border shadow-sm bg-card flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-foreground text-sm mb-1">Distribución por Categoría</h3>
                        <p className="text-xs text-muted-foreground mb-6">Desglose porcentual por tipo de gasto</p>
                        
                        {isLoading ? (
                            <div className="space-y-4">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <Skeleton key={i} className="h-10 rounded-xl" />
                                ))}
                            </div>
                        ) : categoryChartData.length > 0 ? (
                            <div className="space-y-4 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                                {categoryChartData.map((cat: any) => (
                                    <div key={cat.name} className="space-y-1.5">
                                        <div className="flex justify-between items-center text-xs">
                                            <div className="flex items-center gap-2 truncate">
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: cat.color || '#6366f1' }}
                                                />
                                                <span className="font-semibold text-foreground truncate">{cat.name}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="font-mono font-bold text-foreground">{fmtCurrency(cat.total)}</span>
                                                <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">({cat.percentage}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${Math.min(100, cat.percentage)}%`,
                                                    backgroundColor: cat.color || '#6366f1'
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground opacity-50">
                                <Layers size={32} className="mb-2" />
                                <p className="text-xs font-bold">Sin categorías registradas</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Historial Detallado de Gastos */}
            <Card className="rounded-3xl border border-border shadow-sm bg-card overflow-hidden">
                <div className="p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="font-bold text-foreground text-base">Historial Auditoría de Gastos</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Detalle completo de gastos registrados desde la caja con responsables y comprobantes.
                        </p>
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Buscar por glosa, usuario o categoría..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 text-xs h-9 bg-muted/40 border-border"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="table-header text-left">Fecha / Hora</th>
                                <th className="table-header text-left">Categoría</th>
                                <th className="table-header text-left">Descripción / Glosa</th>
                                <th className="table-header text-center">Método Pago</th>
                                <th className="table-header text-left">Responsable (Cajero)</th>
                                <th className="table-header text-left">Terminal / Caja</th>
                                <th className="table-header text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-border/50">
                                        <td colSpan={7} className="px-5 py-4">
                                            <Skeleton className="h-6 w-full rounded-lg" />
                                        </td>
                                    </tr>
                                ))
                            ) : filteredExpenses.length > 0 ? (
                                filteredExpenses.map((exp: any) => (
                                    <tr key={exp.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/40 transition-colors">
                                        <td className="px-5 py-4 font-mono text-muted-foreground whitespace-nowrap">
                                            {exp.date_formatted}
                                        </td>
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <span
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider"
                                                style={{
                                                    backgroundColor: `${exp.category_color}18`,
                                                    color: exp.category_color,
                                                    borderColor: `${exp.category_color}40`,
                                                    filter: 'brightness(0.85)'
                                                }}
                                            >
                                                {exp.category_name}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 max-w-xs truncate font-medium text-foreground" title={exp.glosa}>
                                            {exp.glosa}
                                        </td>
                                        <td className="px-5 py-4 text-center whitespace-nowrap">
                                            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                                                {exp.payment_method}
                                            </Badge>
                                        </td>
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                                                    {exp.user_name.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-foreground">{exp.user_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap font-mono">
                                            {exp.cash_register}
                                        </td>
                                        <td className="px-5 py-4 text-right font-extrabold text-foreground font-mono whitespace-nowrap">
                                            {fmtCurrency(exp.amount)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-5 py-16 text-center text-muted-foreground">
                                        <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                                        <p className="font-bold text-sm">No se encontraron registros de gastos</p>
                                        <p className="text-xs opacity-70 mt-1">Intente ajustar los filtros de fecha o búsqueda.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
