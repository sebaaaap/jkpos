"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, Phone, Mail, Building2, FileText, Globe, Upload, Trash2, ImagePlus, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

export function BusinessInfo() {
    const { settings, saveSettings, isLoaded } = useSettings();
    const [formData, setFormData] = useState(settings);
    const [saved, setSaved] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isLoaded) {
            setFormData(settings);
        }
    }, [settings, isLoaded]);

    // Comprobar qué campos han sido modificados respecto a los datos guardados
    const modifiedFields = useMemo(() => {
        const modified = new Set<string>();
        if (!isLoaded) return modified;

        const keys: (keyof typeof settings)[] = [
            'businessName', 'description', 'phone', 'email', 'website', 'taxId', 'address', 'businessType', 'currency', 'logoBase64'
        ];

        keys.forEach(key => {
            if ((formData[key] || '') !== (settings[key] || '')) {
                modified.add(key);
            }
        });

        return modified;
    }, [formData, settings, isLoaded]);

    const isDirty = modifiedFields.size > 0;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const formDataStr = new FormData();
                formDataStr.append("file", file);
                
                // Show temporary local preview
                const reader = new FileReader();
                reader.onloadend = () => {
                    setFormData(prev => ({ ...prev, logoBase64: reader.result as string }));
                };
                reader.readAsDataURL(file);
                
                // Upload to server
                import('@/lib/api').then(({ default: api }) => {
                    api.post('/companies/me/logo', formDataStr, {
                        headers: { "Content-Type": "multipart/form-data" }
                    }).then(res => {
                        const url = res.data.logo_url;
                        const fullUrl = url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')}${url}`;
                        setFormData(prev => ({ ...prev, logoBase64: fullUrl }));
                        saveSettings({ ...formData, logoBase64: fullUrl });
                    }).catch(err => {
                        console.error("Error subiendo logo", err);
                    });
                });
                
            } catch (error) {
                console.error("Error handling logo upload", error);
            }
        }
    };

    const removeLogo = () => {
        setFormData(prev => ({ ...prev, logoBase64: null }));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSave = () => {
        saveSettings(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
    };

    const businessTypes = [
        { value: 'lubricentro', label: 'Lubricentro' },
        { value: 'taller', label: 'Taller Mecánico' },
        { value: 'vulcanizacion', label: 'Vulcanización' },
        { value: 'mixto', label: 'Mixto (Lubricentro + Taller)' },
    ];

    const currencies = [
        { value: 'USD', label: 'USD - Dólar' },
        { value: 'MXN', label: 'MXN - Peso Mexicano' },
        { value: 'CLP', label: 'CLP - Peso Chileno' },
        { value: 'COP', label: 'COP - Peso Colombiano' },
        { value: 'PEN', label: 'PEN - Sol Peruano' },
        { value: 'ARS', label: 'ARS - Peso Argentino' },
        { value: 'EUR', label: 'EUR - Euro' },
    ];

    // Helper para dar clase de resaltado si el campo cambió
    const getFieldInputStyle = (fieldName: string) => {
        const isFieldModified = modifiedFields.has(fieldName);
        if (isFieldModified) {
            return "w-full px-4 py-3 rounded-xl bg-amber-500/10 border-2 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 dark:text-amber-100 font-semibold focus:outline-none focus:ring-4 focus:ring-amber-500/30 transition-all";
        }
        return "w-full px-4 py-3 rounded-xl bg-background border-2 border-border/80 text-foreground font-medium focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all";
    };

    if (!isLoaded) return <div className="p-8 text-center text-muted-foreground">Cargando ajustes...</div>;

    return (
        <div className="space-y-6">
            {/* Banner de aviso de cambios sin guardar */}
            {isDirty && !saved && (
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-900 dark:text-amber-200 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div>
                            <p className="text-sm font-bold">Tienes cambios sin guardar</p>
                            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">Los campos modificados están resaltados en naranja. Haz clic en 'Guardar Cambios' para aplicar.</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-md shadow-amber-600/30 transition-all shrink-0"
                    >
                        Guardar Ahora
                    </button>
                </div>
            )}

            {/* Banner de confirmación de guardado exitoso */}
            {saved && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-900 dark:text-emerald-200 animate-in fade-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                        <p className="text-sm font-extrabold">¡Cambios guardados con éxito!</p>
                        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">Los datos del negocio han sido actualizados e integrados en el sistema.</p>
                    </div>
                </div>
            )}

            {/* Logo Section */}
            <div className={`border p-5 rounded-2xl flex items-center gap-6 transition-all ${
                modifiedFields.has('logoBase64') ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20' : 'bg-muted/30 border-border'
            }`}>
                <div className="flex-shrink-0">
                    <div className="w-24 h-24 rounded-xl bg-background border-2 border-border flex items-center justify-center overflow-hidden shadow-sm">
                        {formData.logoBase64 ? (
                            <img src={formData.logoBase64} alt="Logo" className="w-full h-full object-contain p-1" />
                        ) : (
                            <ImagePlus className="w-8 h-8 text-muted-foreground/50" />
                        )}
                    </div>
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground">Logotipo del Negocio</h3>
                        {modifiedFields.has('logoBase64') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 mb-3">Recomendado: formato PNG o JPG, tamaño cuadrado o apaisado (max 5MB).</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleLogoUpload}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-colors"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Subir Logo
                        </button>
                        {formData.logoBase64 && (
                            <button
                                onClick={removeLogo}
                                className="flex items-center gap-2 px-4 py-2 text-destructive hover:bg-destructive/10 rounded-xl text-xs font-bold transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Quitar
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nombre del Negocio */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-primary" />
                            Nombre del Negocio
                        </label>
                        {modifiedFields.has('businessName') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <input
                        type="text"
                        name="businessName"
                        value={formData.businessName || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('businessName')}
                        placeholder="jkpos"
                    />
                </div>

                {/* Slogan */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            Descripción / Slogan
                        </label>
                        {modifiedFields.has('description') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <input
                        type="text"
                        name="description"
                        value={formData.description || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('description')}
                        placeholder="Taller Mecánico Especializado"
                    />
                </div>

                {/* Telefono */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-primary" />
                            Teléfono
                        </label>
                        {modifiedFields.has('phone') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <input
                        type="tel"
                        name="phone"
                        value={formData.phone || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('phone')}
                        placeholder="+56 9 1234 5678"
                    />
                </div>

                {/* Email */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-primary" />
                            Correo Electrónico
                        </label>
                        {modifiedFields.has('email') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <input
                        type="email"
                        name="email"
                        value={formData.email || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('email')}
                        placeholder="contacto@jkpos.cl"
                    />
                </div>

                {/* Sitio Web */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-primary" />
                            Sitio Web
                        </label>
                        {modifiedFields.has('website') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <input
                        type="text"
                        name="website"
                        value={formData.website || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('website')}
                        placeholder="www.jkpos.cl"
                    />
                </div>

                {/* TAX ID */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            RFC / RUC / NIT / RUT
                        </label>
                        {modifiedFields.has('taxId') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <input
                        type="text"
                        name="taxId"
                        value={formData.taxId || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('taxId')}
                        placeholder="76.123.456-7"
                    />
                </div>
            </div>

            {/* Dirección */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        Dirección Comercial
                    </label>
                    {modifiedFields.has('address') && (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                            Modificado
                        </span>
                    )}
                </div>
                <input
                    type="text"
                    name="address"
                    value={formData.address || ''}
                    onChange={handleChange}
                    className={getFieldInputStyle('address')}
                    placeholder="Promoncaes 1403 Renca, Santiago, Chile"
                />
            </div>

            {/* Tipo de Negocio y Moneda Base */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/50">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-primary" />
                            Tipo de Negocio
                        </label>
                        {modifiedFields.has('businessType') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <select
                        name="businessType"
                        value={formData.businessType || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('businessType')}
                    >
                        {businessTypes.map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-primary" />
                            Moneda Base
                        </label>
                        {modifiedFields.has('currency') && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-500 text-white">
                                Modificado
                            </span>
                        )}
                    </div>
                    <select
                        name="currency"
                        value={formData.currency || ''}
                        onChange={handleChange}
                        className={getFieldInputStyle('currency')}
                    >
                        {currencies.map((curr) => (
                            <option key={curr.value} value={curr.value}>
                                {curr.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Botones de Acción dinámicos */}
            <div className="flex items-center justify-between pt-6 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground">
                    {isDirty ? (
                        <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                            {modifiedFields.size} {modifiedFields.size === 1 ? 'campo modificado' : 'campos modificados'}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Todos los cambios están guardados.</span>
                    )}
                </div>

                <div className="flex gap-3">
                    {isDirty && (
                        <button
                            onClick={() => setFormData(settings)}
                            className="px-5 py-3 rounded-xl border border-border text-foreground text-xs font-bold hover:bg-muted transition-all"
                        >
                            Deshacer Cambios
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={!isDirty && !saved}
                        className={`px-8 py-3 rounded-xl text-sm font-extrabold transition-all flex items-center gap-2 shadow-lg ${
                            saved
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-500/30'
                                : isDirty
                                ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 text-white shadow-amber-600/30 animate-pulse ring-2 ring-amber-500/40 cursor-pointer'
                                : 'bg-muted text-muted-foreground shadow-none cursor-not-allowed border border-border/50'
                        }`}
                    >
                        {saved ? (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                ¡Cambios Guardados Exitosamente!
                            </>
                        ) : isDirty ? (
                            <>
                                <Save className="w-4 h-4" />
                                ⚠️ Guardar Cambios Pendientes
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 opacity-50" />
                                Sin Cambios por Guardar
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Nota:</strong> Estos datos se utilizarán para la generación de cotizaciones, reportes y comprobantes (PDF). Puedes cambiar el logotipo o datos en cualquier momento.
                </p>
            </div>
        </div>
    );
}
