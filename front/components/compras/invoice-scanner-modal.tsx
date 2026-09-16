"use client";

import React, { useRef, useState, useEffect } from "react";
import {
    X, Scan, Building2, FileText, CheckCircle2, AlertCircle,
    Loader2, ShoppingBag, Plus, Trash2, ArrowRight, Zap, RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

interface ScannedItem {
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_cost: number;
    barcode: string | null;
    is_matched: boolean;
}

interface ParsedInvoice {
    supplier_id: string | null;
    supplier_rut: string;
    supplier_name: string;
    invoice_number: string;
    date_created: string;
    total_amount: number;
    items: ScannedItem[];
}

interface Props {
    onClose: () => void;
    onImported: () => void;
}

export function InvoiceScannerModal({ onClose, onImported }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [scanBuffer, setScanBuffer] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedInvoice | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Foco automático sostenido para la pistola lectora
    useEffect(() => {
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, [parsedData]);

    const handleParseScan = async (payload: string) => {
        if (!payload.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.post("/purchases/parse-scanned-invoice", {
                scan_payload: payload.trim()
            });
            setParsedData(res.data);
        } catch (err: any) {
            console.error("Error parsing scanned invoice", err);
            setError(err.response?.data?.detail || "No se pudo interpretar el código de la factura.");
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleParseScan(scanBuffer);
        }
    };

    const handleItemChange = (index: number, field: keyof ScannedItem, val: any) => {
        if (!parsedData) return;
        const newItems = [...parsedData.items];
        newItems[index] = { ...newItems[index], [field]: val };

        // Recalcular monto total acumulado
        const newTotal = newItems.reduce((acc, it) => acc + (it.quantity * it.unit_cost), 0);
        setParsedData({
            ...parsedData,
            total_amount: newTotal,
            items: newItems
        });
    };

    const handleAddItem = () => {
        if (!parsedData) return;
        setParsedData({
            ...parsedData,
            items: [
                ...parsedData.items,
                {
                    product_id: null,
                    product_name: "Nuevo Producto Escaneado",
                    quantity: 1,
                    unit_cost: 0,
                    barcode: null,
                    is_matched: false
                }
            ]
        });
    };

    const handleRemoveItem = (index: number) => {
        if (!parsedData) return;
        const newItems = parsedData.items.filter((_, i) => i !== index);
        setParsedData({
            ...parsedData,
            items: newItems
        });
    };

    const handleConfirmPurchase = async () => {
        if (!parsedData || parsedData.items.length === 0) return;
        setConfirming(true);
        setError(null);
        try {
            const payload = {
                supplier_id: parsedData.supplier_id,
                supplier_rut: parsedData.supplier_rut,
                supplier_name: parsedData.supplier_name,
                invoice_number: parsedData.invoice_number,
                items: parsedData.items.map(it => ({
                    product_id: it.product_id,
                    product_name: it.product_name,
                    quantity: Number(it.quantity),
                    unit_cost: Number(it.unit_cost),
                    barcode: it.barcode
                })),
                notes: "Ingreso por Pinchazo Único de Factura (Pistola Lectora)"
            };

            const res = await api.post("/purchases/fast-confirm-scanned", payload);
            setSuccessMessage(`¡Factura N° ${res.data.invoice_number} cargada e inventario actualizado exitosamente!`);
            setTimeout(() => {
                onImported();
                onClose();
            }, 1200);
        } catch (err: any) {
            console.error("Error confirming fast purchase", err);
            setError(err.response?.data?.detail || "Error al ingresar la compra y actualizar inventario.");
        } finally {
            setConfirming(false);
        }
    };

    const handleReset = () => {
        setParsedData(null);
        setScanBuffer("");
        setError(null);
        setSuccessMessage(null);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                            <Scan size={22} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                                Ingreso Rápido de Factura por Pistola Lectora
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                    Pinchazo Único
                                </Badge>
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Apunte la pistola al timbre 2D (TED) o código impreso de la factura física.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl hover:bg-muted text-muted-foreground flex items-center justify-center transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                    {/* Visual Status Indicator */}
                    <div className="p-4 rounded-2xl bg-card border border-border flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/20">
                        <div className="flex items-center gap-3">
                            <div className="relative flex h-3.5 w-3.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                            </div>
                            <span className="text-xs font-bold text-foreground">
                                Receptor de Escáner Listo. Esperando Disparo de la Pistola...
                            </span>
                        </div>

                        {parsedData && (
                            <Button
                                onClick={handleReset}
                                variant="ghost"
                                size="sm"
                                className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                            >
                                <RefreshCcw size={14} />
                                Escanear Otra Factura
                            </Button>
                        )}
                    </div>

                    {/* Scanner Input Trigger */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Lectura Directa de Pistola Lectora (Timbre TED / Código DTE)
                        </label>
                        <div className="relative">
                            <Scan className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                            <Input
                                ref={inputRef}
                                type="text"
                                value={scanBuffer}
                                onChange={(e) => setScanBuffer(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Apunte y gatille la pistola aquí para cargar la factura completa..."
                                className="pl-11 pr-24 h-12 text-sm font-mono border-primary/30 focus-visible:ring-primary/40 bg-background shadow-inner"
                            />
                            <Button
                                onClick={() => handleParseScan(scanBuffer)}
                                disabled={loading || !scanBuffer.trim()}
                                size="sm"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 text-xs font-bold gap-1"
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                Procesar
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-3">
                            <AlertCircle size={18} className="shrink-0" />
                            <p className="font-medium">{error}</p>
                        </div>
                    )}

                    {successMessage && (
                        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-3 animate-in fade-in">
                            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                            <p className="font-bold">{successMessage}</p>
                        </div>
                    )}

                    {/* Preview of Parsed Invoice Data */}
                    {parsedData && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* Metadata Header */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                                <div>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Proveedor</span>
                                    <div className="font-bold text-sm text-foreground flex items-center gap-1.5 mt-0.5">
                                        <Building2 size={14} className="text-primary shrink-0" />
                                        <span className="truncate">{parsedData.supplier_name}</span>
                                    </div>
                                    <span className="text-[11px] font-mono text-muted-foreground">RUT: {parsedData.supplier_rut || "S/RUT"}</span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">N° Factura / Folio</span>
                                    <div className="font-extrabold text-sm text-foreground flex items-center gap-1.5 mt-0.5 font-mono">
                                        <FileText size={14} className="text-primary shrink-0" />
                                        <span>{parsedData.invoice_number}</span>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">Fecha: {parsedData.date_created}</span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Monto Total Factura</span>
                                    <div className="font-black text-base text-foreground mt-0.5 font-mono text-emerald-600">
                                        ${Math.round(parsedData.total_amount).toLocaleString("es-CL")}
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">{parsedData.items.length} ítems detectados</span>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <ShoppingBag size={14} />
                                        Detalle de Productos a Ingresar a Inventario
                                    </h4>
                                    <Button onClick={handleAddItem} variant="outline" size="sm" className="h-7 text-[11px] gap-1">
                                        <Plus size={12} /> Añadir Producto
                                    </Button>
                                </div>

                                <div className="border border-border rounded-2xl overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-border bg-muted/40">
                                                <th className="table-header text-left">Producto / Descripción</th>
                                                <th className="table-header text-center w-24">Cantidad</th>
                                                <th className="table-header text-right w-32">Costo Unit. ($)</th>
                                                <th className="table-header text-right w-32">Subtotal ($)</th>
                                                <th className="table-header text-center w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedData.items.map((it, idx) => (
                                                <tr key={idx} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20">
                                                    <td className="px-4 py-3">
                                                        <Input
                                                            type="text"
                                                            value={it.product_name}
                                                            onChange={(e) => handleItemChange(idx, "product_name", e.target.value)}
                                                            className="h-8 text-xs font-medium"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={it.quantity}
                                                            onChange={(e) => handleItemChange(idx, "quantity", Number(e.target.value))}
                                                            className="h-8 text-xs font-mono text-center"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            value={it.unit_cost}
                                                            onChange={(e) => handleItemChange(idx, "unit_cost", Number(e.target.value))}
                                                            className="h-8 text-xs font-mono text-right"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold font-mono text-foreground whitespace-nowrap">
                                                        ${Math.round(it.quantity * it.unit_cost).toLocaleString("es-CL")}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button
                                                            onClick={() => handleRemoveItem(idx)}
                                                            className="p-1 hover:bg-red-50 text-muted-foreground hover:text-red-600 rounded-md transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="p-6 border-t border-border bg-card flex items-center justify-between">
                    <Button onClick={onClose} variant="outline" size="sm" className="font-semibold">
                        Cancelar
                    </Button>

                    {parsedData && (
                        <Button
                            onClick={handleConfirmPurchase}
                            disabled={confirming || parsedData.items.length === 0}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 gap-2"
                        >
                            {confirming ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Confirmando e Ingresando Stock...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={16} />
                                    Confirmar Compra e Ingresar Stock de Inmediato
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
