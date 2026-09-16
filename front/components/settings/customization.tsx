"use client";

import { useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, RotateCcw } from 'lucide-react';
import api from "@/lib/api";
import { toast } from "sonner";

export function Customization() {
    const [logo, setLogo] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Cargar logo actual desde el backend
    useEffect(() => {
        api.get("/companies/me")
            .then(res => {
                setLogo(res.data?.logo_url || null);
            })
            .catch(() => {
                // Si no hay empresa (ej: superadmin), simplemente no mostrar logo
            })
            .finally(() => setLoading(false));
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post("/companies/me/logo", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setLogo(res.data.logo_url);
            toast.success("Logo actualizado correctamente");
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Error al subir el logo");
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveLogo = async () => {
        try {
            await api.patch("/companies/me", { logo_url: null });
            setLogo(null);
            toast.success("Logo eliminado");
        } catch (err: any) {
            toast.error("Error al eliminar el logo");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="text-muted-foreground text-sm">Cargando...</div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 gap-8">
                {/* Logo Section */}
                <div className="space-y-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-primary" />
                        Logo de la Empresa
                    </label>

                    <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center space-y-4 hover:border-primary/50 transition-all bg-card/50">
                        <div className="w-40 h-40 mx-auto bg-white rounded-2xl shadow-inner flex items-center justify-center overflow-hidden border border-border">
                            {logo ? (
                                <img
                                    src={logo}
                                    alt="Logo"
                                    className="w-full h-full object-contain p-4"
                                />
                            ) : (
                                <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                            )}
                        </div>

                        <div className="space-y-3">
                            <label className="inline-block">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                    disabled={uploading}
                                />
                                <span className={`flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-xl text-sm font-bold cursor-pointer hover:bg-secondary/80 transition-colors shadow-sm ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Upload className="w-4 h-4" />
                                    {uploading ? "Subiendo..." : logo ? "Cambiar Logo" : "Subir Logo"}
                                </span>
                            </label>
                            {logo && (
                                <button
                                    onClick={handleRemoveLogo}
                                    className="flex items-center gap-2 px-4 py-2 text-destructive text-sm font-semibold hover:bg-destructive/5 rounded-xl transition-colors"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Quitar Logo
                                </button>
                            )}
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold opacity-60">
                                Formatos: PNG, JPG (Máx. 5MB) — Se recomienda fondo transparente
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6">
                <h4 className="text-xs font-bold text-primary uppercase mb-3 px-1">Información</h4>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <li className="flex gap-3 text-xs text-muted-foreground">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">1</span>
                        El logo aparece en los reportes enviados por correo electrónico.
                    </li>
                    <li className="flex gap-3 text-xs text-muted-foreground">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">2</span>
                        Se recomiendan logos con fondo transparente (PNG) para mejor integración.
                    </li>
                </ul>
            </div>
        </div>
    );
}
