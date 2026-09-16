"use client";

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, User, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(username, password);
        } catch (err: any) {
            setError(err.message || 'Usuario o contraseña incorrectos');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden p-6 text-slate-800">
            {/* Background Accent Glows */}
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#e20613]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#e20613]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(#e20613_0.6px,transparent_0.6px)] [background-size:24px_24px] opacity-[0.05] -z-10" />

            {/* Contenedor Principal Centrado */}
            <div className="w-full max-w-md relative z-10">
                {/* Logo y Título */}
                <div className="text-center mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="inline-flex items-center justify-center p-2 mb-2">
                        <img
                            src="/logocelular.png"
                            alt="Logo"
                            className="max-h-28 w-auto object-contain drop-shadow-[0_4px_12px_rgba(235,25,20,0.15)]"
                        />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-1 uppercase">
                        JK Vulcanización
                    </h1>
                    <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">
                        Sistema de Punto de Venta e Inventario
                    </p>
                </div>

                {/* Wrapper de la Card + Dino apoyado */}
                <div className="relative">
                    {/* Card de Login Centrada */}
                    <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/90 border border-slate-200/90 overflow-hidden relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                        <div className="p-8">
                            <div className="mb-6">
                                <h2 className="text-xl font-extrabold text-slate-900">Iniciar Sesión</h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    Ingrese sus credenciales para continuar
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Error Alert */}
                                {error && (
                                    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <AlertCircle size={20} className="shrink-0 mt-0.5 text-[#e20613]" />
                                        <div className="text-sm font-medium">{error}</div>
                                    </div>
                                )}

                                {/* Username */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                                        Usuario
                                    </label>
                                    <div className="relative">
                                        <User
                                            size={18}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                                        />
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50/80 border-2 border-slate-200/90 focus:bg-white focus:border-[#e20613] focus:ring-4 focus:ring-[#e20613]/15 outline-none transition-all text-slate-900 font-medium placeholder:text-slate-400"
                                            placeholder="Ingrese su usuario"
                                            required
                                            autoFocus
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                                        Contraseña
                                    </label>
                                    <div className="relative">
                                        <Lock
                                            size={18}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                                        />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-12 pr-12 py-3 rounded-xl bg-slate-50/80 border-2 border-slate-200/90 focus:bg-white focus:border-[#e20613] focus:ring-4 focus:ring-[#e20613]/15 outline-none transition-all text-slate-900 font-medium placeholder:text-slate-400"
                                            placeholder="Ingrese su contraseña"
                                            required
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
                                            title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                                        >
                                            {showPassword ? (
                                                <EyeOff size={18} />
                                            ) : (
                                                <Eye size={18} />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-gradient-to-r from-[#e20613] via-[#d60511] to-[#c4050f] hover:from-[#ff101e] hover:to-[#ab040c] text-white font-bold rounded-xl shadow-lg shadow-[#e20613]/30 hover:shadow-xl hover:shadow-[#e20613]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            <span>Iniciando sesión...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Lock size={20} />
                                            <span>Ingresar al Sistema</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="text-center mt-6 text-xs text-slate-500 animate-in fade-in duration-500 delay-200">
                    <p>© 2026 JK POS. Sistema de Gestión Empresarial.</p>
                    <p className="mt-1 font-semibold text-slate-400">Powered by VankaiLabs</p>
                </div>
            </div>
        </div>
    );
}

