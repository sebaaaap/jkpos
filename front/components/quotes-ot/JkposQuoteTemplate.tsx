"use client"

import React from "react"
import { QuoteOtItem } from "./quotes-ot-manager"
import { useSettings } from "@/hooks/useSettings"

interface JkposQuoteTemplateProps {
    data: QuoteOtItem
    type: "quote" | "ot"
    /** Nota personalizada que escribe el admin antes de imprimir */
    notaCotizacion?: string
}

/**
 * Plantilla jkpos — fiel al diseño LaTeX (jkposlatex.txt).
 *
 * Conversión de coordenadas TikZ → SVG/CSS:
 *   TikZ: (0,0) = esquina inferior-izquierda, Y sube.
 *   CSS/SVG viewBox: (0,0) = esquina superior-izquierda, Y baja.
 *   Página A4: 210 mm × 297 mm.
 *
 * Para que las franjas no se deformen con contenido variable,
 * usamos DOS SVGs de altura fija (65 mm cada uno):
 *   - Superior: viewBox="0 0 210 65"   → pegado al top
 *   - Inferior: viewBox="0 232 210 65" → pegado al bottom
 *
 * Logos:
 *   - Principal  : centro en (14.2 cm, 3.2 cm desde arriba)   ← LaTeX xshift=-6.8cm,yshift=-3.2cm desde NE
 *   - Watermark  : centro en (14.2 cm, 23.1 cm desde arriba)  ← LaTeX xshift=-6.8cm,yshift=6.6cm desde SE
 */
export function JkposQuoteTemplate({ data, type, notaCotizacion }: JkposQuoteTemplateProps) {
    const { settings, isLoaded } = useSettings()

    if (!isLoaded) {
        return <div className="p-8 text-center text-muted-foreground">Cargando documento...</div>
    }

    // ─── Empresa (100 % desde settings) ──────────────────────────────────────
    const logoUrl      = settings.logoBase64 || null
    const ownerName    = "Fernando Pastrian"                        // fijo por defecto
    const businessName = settings.businessName || "jkpos"
    const address      = settings.address      || "Promoncaes 1403 Renca"
    const mail         = settings.email        || "pastrianfernando@gmail.com"
    const phone        = settings.phone        || "+569 48481417"
    const formaPago    = "Transferencia / Efectivo / Tarjetas"
    const nota         = notaCotizacion ?? ""

    // ─── Campos del documento ─────────────────────────────────────────────────
    const fechaRaw     = data.date_created || ""
    const fechaDisplay = fechaRaw.includes("-")
        ? fechaRaw.split("-").reverse().join("/")
        : fechaRaw
    const autoCliente  = data.vehicle_model
        ? `${data.vehicle_model}${data.vehicle_plate ? " – " + data.vehicle_plate : ""}`
        : data.vehicle_plate || "—"
    const nombreCliente = data.customer_name || "—"

    // ─── Totales ──────────────────────────────────────────────────────────────
    const neto  = Math.round(data.total / 1.19)
    const iva   = Math.round(data.total - neto)
    const total = Math.round(data.total)
    const fmt   = (n: number) => `$${n.toLocaleString("es-CL")}`

    // ─── Colores corporativos ─────────────────────────────────────────────────
    const NEGRO = "#22201f"
    const ROJO  = "#eb1914"

    // ─── Paths SVG (derivados 1:1 del TikZ en mm) ────────────────────────────
    //
    // FRANJA NEGRA SUPERIOR  (TikZ → SVG, Y invertido):
    //   M 0 0  L 0 65
    //   C 38 35.5, 55 31.5, 82 24.5
    //   C 125 11.5, 180 9.5, 210 8
    //   L 210 0  Z
    //
    // FIGURA ROJA SUPERIOR (esquina derecha):
    //   M 90 11  C 130 9, 170 16, 210 38  L 210 0  Z
    //
    // FRANJA NEGRA INFERIOR  (espejo vertical):
    //   M 210 297  L 210 232
    //   C 172 261.5, 155 265.5, 128 272.5
    //   C 85 285.5,  30 287.5,  0 289
    //   L 0 297  Z
    //
    // FIGURA ROJA INFERIOR (esquina izquierda):
    //   M 120 286  C 80 288, 40 281, 0 259  L 0 297  Z

    return (
        <div
            id="jkpos-document-to-print"
            style={{
                position:   "relative",
                width:      "100%",       // ocupa todo el contenedor del modal
                minHeight:  "297mm",
                background: "#fff",
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                color:      NEGRO,
                boxSizing:  "border-box",
            }}
        >
            {/* ══════════════════════════════════════════════════════════
                SVG SUPERIOR — altura fija 65 mm, no se deforma
            ══════════════════════════════════════════════════════════ */}
            <svg
                aria-hidden="true"
                viewBox="0 0 210 65"
                preserveAspectRatio="none"
                style={{
                    position: "absolute",
                    top: 0, left: 0,
                    width: "100%", height: "65mm",
                    display: "block",
                    zIndex: 0,
                }}
            >
                {/* Rojo superior — se dibuja primero (queda debajo del negro) */}
                <path
                    d="M 90 11 C 130 9, 170 16, 210 38 L 210 0 Z"
                    fill={ROJO}
                />
                {/* Negro superior — domina la izquierda y cubre parte del rojo */}
                <path
                    d="M 0 0 L 0 65 C 38 35.5, 55 31.5, 82 24.5 C 125 11.5, 180 9.5, 210 8 L 210 0 Z"
                    fill={NEGRO}
                />
            </svg>

            {/* ══════════════════════════════════════════════════════════
                SVG INFERIOR — altura fija 65 mm, pegado al bottom
                viewBox arranca en y=232 (297-65=232) del espacio A4
            ══════════════════════════════════════════════════════════ */}
            <svg
                aria-hidden="true"
                viewBox="0 232 210 65"
                preserveAspectRatio="none"
                style={{
                    position: "absolute",
                    bottom: 0, left: 0,
                    width: "100%", height: "65mm",
                    display: "block",
                    zIndex: 0,
                }}
            >
                {/* Rojo inferior — esquina izquierda */}
                <path
                    d="M 120 286 C 80 288, 40 281, 0 259 L 0 297 Z"
                    fill={ROJO}
                />
                {/* Negro inferior — domina la derecha */}
                <path
                    d="M 210 297 L 210 232 C 172 261.5, 155 265.5, 128 272.5 C 85 285.5, 30 287.5, 0 289 L 0 297 Z"
                    fill={NEGRO}
                />
            </svg>

            {/* ══════════════════════════════════════════════════════════
                LOGO PRINCIPAL
                LaTeX: \node[anchor=center] at ([xshift=-6.8cm,yshift=-3.2cm] north east)
                → centro X = 21 - 6.8 = 14.2 cm desde izquierda
                → centro Y = 3.2 cm desde arriba
                Ancho del logo en LaTeX: 6.5 cm
            ══════════════════════════════════════════════════════════ */}
            {logoUrl && (
                <div
                    style={{
                        position:  "absolute",
                        left:      "14.2cm",
                        top:       "3.2cm",
                        transform: "translate(-50%, -50%)",
                        width:     "6.5cm",
                        zIndex:    4,
                    }}
                >
                    <img
                        src={logoUrl}
                        alt="Logo"
                        style={{ width: "100%", height: "auto", objectFit: "contain" }}
                    />
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                MARCA DE AGUA
                LaTeX: \node[opacity=0.12] at ([xshift=-6.8cm,yshift=6.6cm] south east)
                → centro X = 14.2 cm desde izquierda  (misma X que logo)
                → centro Y = 29.7 - 6.6 = 23.1 cm desde arriba
                Ancho: 6.5 cm  |  Opacidad: 0.12
            ══════════════════════════════════════════════════════════ */}
            {logoUrl && (
                <div
                    style={{
                        position:      "absolute",
                        left:          "14.2cm",
                        top:           "24cm",
                        transform:     "translate(-50%, -50%)",
                        width:         "6.5cm",
                        opacity:       0.12,
                        pointerEvents: "none",
                        zIndex:        1,
                    }}
                >
                    <img
                        src={logoUrl}
                        alt=""
                        style={{ width: "100%", height: "auto", objectFit: "contain" }}
                    />
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                CONTENIDO PRINCIPAL
                Flex-column con flex:1 entre tabla y totales
                (equivalente al \vfill de LaTeX).
                El footer queda en zona blanca, con texto oscuro.
            ══════════════════════════════════════════════════════════ */}
            <div
                style={{
                    position:        "relative",
                    zIndex:          2,
                    display:         "flex",
                    flexDirection:   "column",
                    minHeight:       "297mm",
                    padding:         "0 18mm",
                }}
            >
                {/* Espacio para la zona de la franja superior (65 mm) más pequeño gap */}
                <div style={{ height: "48mm" }} />

                {/* ── TÍTULO ── */}
                <div style={{ textAlign: "center", marginBottom: "7mm" }}>
                    <span style={{
                        fontSize:      "28pt",
                        fontWeight:    "bold",
                        color:         NEGRO,
                        letterSpacing: "-0.5px",
                    }}>
                        Cotización
                    </span>
                </div>

                {/* ── DATOS (Fecha / Auto / Cliente) ── */}
                <div style={{ marginBottom: "5mm", fontSize: "11.5pt", lineHeight: "1.7" }}>
                    <div>
                        <span style={{ fontWeight: "bold" }}>Fecha:</span>
                        &nbsp;&nbsp;{fechaDisplay}
                    </div>
                    <div>
                        <span style={{ fontWeight: "bold" }}>Auto:</span>
                        &nbsp;&nbsp;&nbsp;&nbsp;{autoCliente}
                    </div>
                    <div>
                        <span style={{ fontWeight: "bold" }}>Cliente:</span>
                        &nbsp;&nbsp;{nombreCliente}
                    </div>
                </div>

                {/* ── TABLA DE PRODUCTOS ── */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
                    <thead>
                        <tr style={{ backgroundColor: NEGRO, color: "#fff" }}>
                            <th style={{ textAlign: "left",   padding: "5px 7px", fontWeight: "bold", fontSize: "9pt", width: "45%" }}>DESCRIPCIÓN</th>
                            <th style={{ textAlign: "center", padding: "5px 7px", fontWeight: "bold", fontSize: "9pt", width: "12%" }}>UNIDADES</th>
                            <th style={{ textAlign: "center", padding: "5px 7px", fontWeight: "bold", fontSize: "9pt", width: "15%" }}>PRECIO</th>
                            <th style={{ textAlign: "center", padding: "5px 7px", fontWeight: "bold", fontSize: "9pt", width: "14%" }}>IVA (19%)</th>
                            <th style={{ textAlign: "center", padding: "5px 7px", fontWeight: "bold", fontSize: "9pt", width: "14%" }}>TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item, i) => {
                            const rowTotal = item.price * item.quantity
                            const rowNeto  = rowTotal / 1.19
                            const rowIva   = rowTotal - rowNeto
                            return (
                                <tr key={i} style={{ borderBottom: "1px solid #e0e0e0" }}>
                                    <td style={{ padding: "5px 7px" }}>{item.product_name}</td>
                                    <td style={{ padding: "5px 7px", textAlign: "center" }}>{item.quantity}</td>
                                    <td style={{ padding: "5px 7px", textAlign: "center" }}>{fmt(Math.round(rowNeto))}</td>
                                    <td style={{ padding: "5px 7px", textAlign: "center" }}>{fmt(Math.round(rowIva))}</td>
                                    <td style={{ padding: "5px 7px", textAlign: "center" }}>{fmt(Math.round(rowTotal))}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                {/* ── VFILL — empuja totales/footer hacia abajo (como \vfill en LaTeX) ── */}
                <div style={{ flex: 1, minHeight: "12mm" }} />

                {/* ── SEPARADOR ── */}
                <div style={{ borderTop: `0.5px solid ${NEGRO}`, marginBottom: "5mm" }} />

                {/* ── TOTALES — compactos, alineados a la derecha igual al LaTeX ── */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4mm" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: "11.5pt", lineHeight: "1.85" }}>
                        <tbody>
                            <tr>
                                <td style={{ textAlign: "right", paddingRight: "14mm", whiteSpace: "nowrap" }}>Neto:</td>
                                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(neto)}</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: "right", paddingRight: "14mm", whiteSpace: "nowrap" }}>IVA (19%):</td>
                                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(iva)}</td>
                            </tr>
                            <tr style={{ fontSize: "15pt", fontWeight: "bold", color: ROJO }}>
                                <td style={{ textAlign: "right", paddingRight: "14mm", whiteSpace: "nowrap" }}>Total:</td>
                                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── FORMA DE PAGO Y NOTA ── */}
                <div style={{ fontSize: "10.5pt", lineHeight: "1.7", marginBottom: "5mm" }}>
                    <div>
                        <span style={{ fontWeight: "bold" }}>Forma de pago:</span>
                        &nbsp;&nbsp;{formaPago}
                    </div>
                    {nota && (
                        <div>
                            <span style={{ fontWeight: "bold" }}>Nota:</span>
                            &nbsp;&nbsp;{nota}
                        </div>
                    )}
                </div>

                {/* ── FOOTER ──
                    Texto oscuro (#22201f) sobre fondo blanco.
                    En la zona izquierda la franja negra solo cubre ~8 mm
                    desde el borde inferior, por lo que el footer queda
                    completamente en zona blanca con marginBottom de 28 mm.
                ── */}
                <div style={{ marginBottom: "35mm", color: NEGRO }}>
                    <div style={{ fontSize: "13pt", fontWeight: "bold", marginBottom: "2mm" }}>
                        {ownerName}
                    </div>
                    <div style={{ fontSize: "10pt", lineHeight: "1.75" }}>
                        <span style={{ fontWeight: "bold" }}>Empresa:</span> {businessName}
                        &nbsp;&nbsp;&nbsp;
                        <span style={{ fontWeight: "bold" }}>Dirección:</span> {address}
                        <br />
                        <span style={{ fontWeight: "bold" }}>Mail:</span> {mail}
                        &nbsp;&nbsp;&nbsp;
                        <span style={{ fontWeight: "bold" }}>Teléfono:</span> {phone}
                    </div>
                </div>

            </div>{/* fin flex-column */}
        </div>
    )
}
