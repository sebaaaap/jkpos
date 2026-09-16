"use client";

import { useState } from "react";
import { Mail, Send, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

const TEST_EMAIL = "sebastian.parada1@mail.udp.cl";
type Period = "daily" | "weekly" | "monthly";

const parseEmails = (raw: string): string[] =>
    raw
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

export function EmailReportTest() {
    const [period, setPeriod] = useState<Period>("daily");
    const [emailsRaw, setEmailsRaw] = useState(TEST_EMAIL);
    const [loadingTest, setLoadingTest] = useState(false);
    const [loadingAdmins, setLoadingAdmins] = useState(false);

    const validEmails = parseEmails(emailsRaw);

    const sendReport = async (emails: string[] | null, mode: "test" | "admins") => {
        const setLoading = mode === "test" ? setLoadingTest : setLoadingAdmins;
        setLoading(true);
        try {
            const payload = { period, emails };
            const { data } = await api.post("/reports/email/send", payload);
            const count = data?.recipients?.length || emails?.length || 0;
            toast.success(
                mode === "test"
                    ? `Reporte enviado a ${emails?.join(", ")}`
                    : `Reporte enviado a ${count} administrador${count === 1 ? "" : "es"}`
            );
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.response?.data?.message;
            toast.error(detail || "No se pudo enviar el reporte");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-foreground">Prueba de reportes por correo</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Envía el reporte diario/semanal/mensual por Resend al correo que escribas — puede ser cualquiera.
                        </p>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tipo de reporte</label>
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value as Period)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        >
                            <option value="daily">Diario</option>
                            <option value="weekly">Semanal</option>
                            <option value="monthly">Mensual</option>
                        </select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Correos destinatarios (separa varios con coma)
                        </label>
                        <textarea
                            value={emailsRaw}
                            onChange={(e) => setEmailsRaw(e.target.value)}
                            placeholder="persona@empresa.cl, otro@correo.com"
                            rows={2}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
                        />
                        <p className="text-xs text-muted-foreground">
                            {validEmails.length > 0
                                ? `${validEmails.length} correo${validEmails.length === 1 ? "" : "s"} válido${validEmails.length === 1 ? "" : "s"}: ${validEmails.join(", ")}`
                                : "Escribe al menos un correo válido"}
                        </p>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                        onClick={() => sendReport(validEmails, "test")}
                        disabled={loadingTest || validEmails.length === 0}
                        className="gap-2"
                    >
                        <Send className="h-4 w-4" />
                        {loadingTest
                            ? "Enviando..."
                            : `Enviar a ${validEmails.length || ""} correo${validEmails.length === 1 ? "" : "s"}`}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => sendReport(null, "admins")}
                        disabled={loadingAdmins}
                        className="gap-2"
                    >
                        <Users className="h-4 w-4" />
                        {loadingAdmins ? "Enviando a admins..." : "Enviar a administradores"}
                    </Button>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 text-sm flex gap-3">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                        Dominio verificado en Resend: puedes enviar a cualquier correo. El envío respeta{" "}
                        <span className="font-mono">company_id</span>: cada negocio recibe solo sus propios reportes,
                        logo, ventas, gastos e inventario.
                    </p>
                </div>
            </div>
        </div>
    );
}
