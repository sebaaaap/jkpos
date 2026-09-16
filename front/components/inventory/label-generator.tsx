"use client";

/**
 * Generador de Etiquetas con Código de Barras — Inventario
 * - Selección de productos (checkbox) desde la tabla
 * - Campos configurables: nombre, barcode, referencia interna, categoría
 * - Tamaño de etiqueta configurable (presets térmicos + personalizado)
 * - Código de barras Code 128 dibujado en SVG puro (sin librerías)
 * - Impresión vía IFRAME aislado (about:srcdoc): sin URL, sin título y con
 *   @page margin:0 → Chrome NO puede imprimir hora/ruta/nombre del sistema
 *   en la etiqueta. Solo salen los campos seleccionados.
 */

import { useState, useMemo, useRef } from "react";
import { Printer, X, Tag, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Code 128 encoder (subset B) — SVG puro ────────────────────────────────
// Tabla estándar oficial Code 128: valor 0..106 → patrón de 6 anchos
// (valores 0..94 = ASCII 32..126; 95..102 = especiales subset B; 103..106 = start/stop)
const CODE128_PATTERNS: Record<number, string> = {
    0: "212222", 1: "222122", 2: "222221", 3: "121223", 4: "121322",
    5: "131222", 6: "122213", 7: "122312", 8: "132212", 9: "221213",
    10: "221312", 11: "231212", 12: "112232", 13: "122132", 14: "122231",
    15: "113222", 16: "123122", 17: "123221", 18: "223211", 19: "221132",
    20: "221231", 21: "213212", 22: "223112", 23: "312131", 24: "311222",
    25: "321122", 26: "321221", 27: "312212", 28: "322112", 29: "322211",
    30: "212123", 31: "212321", 32: "232121", 33: "111323", 34: "131123",
    35: "131321", 36: "112313", 37: "132113", 38: "132311", 39: "211313",
    40: "231113", 41: "231311", 42: "112133", 43: "112331", 44: "132131",
    45: "113123", 46: "113321", 47: "133121", 48: "313121", 49: "211331",
    50: "231131", 51: "213113", 52: "213311", 53: "213131", 54: "311123",
    55: "311321", 56: "331121", 57: "312113", 58: "312311", 59: "332111",
    60: "314111", 61: "221411", 62: "431111", 63: "111224", 64: "111422",
    65: "121124", 66: "121421", 67: "141122", 68: "141221", 69: "112214",
    70: "112412", 71: "122114", 72: "122411", 73: "142112", 74: "142211",
    75: "241211", 76: "221114", 77: "413111", 78: "241112", 79: "134111",
    80: "111242", 81: "121142", 82: "121241", 83: "114212", 84: "124112",
    85: "124211", 86: "411212", 87: "421112", 88: "421211", 89: "212141",
    90: "214121", 91: "412121", 92: "111143", 93: "111341", 94: "131141",
    95: "114113", 96: "114311", 97: "411113", 98: "411311", 99: "113141",
    100: "114131", 101: "311141", 102: "411131",
    103: "211412",  // Start A
    104: "211214",  // Start B
    105: "211232",  // Start C
    106: "2331112", // Stop (7 elementos)
};
const START_B = 104;
const STOP = 106;

function encodeCode128(text: string): number[] {
    // Devuelve secuencia de anchos [bar, space, bar, space...] en módulos
    const seq: number[] = [];
    const push = (value: number) => {
        for (const ch of CODE128_PATTERNS[value]) seq.push(parseInt(ch));
    };
    push(START_B);
    // Checksum: (Start B value 104 + Σ char_value × position) % 103
    let checksum = START_B;
    const chars = text.split("");
    chars.forEach((c, i) => {
        const v = c.charCodeAt(0) - 32;
        push(v);
        checksum += v * (i + 1);
    });
    push(checksum % 103);
    push(STOP);
    return seq;
}

function BarcodeSVG({ value, height = 40, moduleWidth = 1.4, showText = true, textFontSize }: {
    value: string; height?: number; moduleWidth?: number; showText?: boolean; textFontSize?: number;
}) {
    const seq = useMemo(() => encodeCode128(value), [value]);
    // Convertir secuencia [bar, space, ...] a rects
    const bars: { x: number; w: number }[] = [];
    let x = 0;
    for (let i = 0; i < seq.length; i += 2) {
        const barW = seq[i] * moduleWidth;
        const spaceW = (seq[i + 1] || 0) * moduleWidth;
        bars.push({ x, w: barW });
        x += barW + spaceW;
    }
    const totalW = x;
    const textH = showText ? Math.max(12, (textFontSize || 9) + 2) : 0;
    // Quiet zone: mínimo 10 módulos a cada lado (exigencia de scanners Code 128)
    const quiet = 10 * moduleWidth;

    return (
        <svg
            width="100%"
            height="100%"
            viewBox={`-${quiet} 0 ${totalW + quiet * 2} ${height + textH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block" }}
        >
            <rect x={-quiet} y={0} width={totalW + quiet * 2} height={height + textH} fill="white" />
            {bars.map((b, i) => (
                <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="black" />
            ))}
            {showText && (
                <text
                    x={totalW / 2}
                    y={height + textH - 2}
                    textAnchor="middle"
                    fontSize={textFontSize || textH - 3}
                    fontFamily="monospace"
                    fontWeight={600}
                    fill="black"
                >
                    {value}
                </text>
            )}
        </svg>
    );
}

// ── Componente principal ───────────────────────────────────────────────────

export interface LabelProduct {
    id: string;
    name: string;
    barcode: string;
    internal_reference?: string | null;
    category_name?: string | null;
    quantity?: number;
}

export interface LabelFields {
    name: boolean;
    barcode: boolean;
    internal_reference: boolean;
    category: boolean;
}

const LABEL_PRESETS = [
    { id: "80x25", label: "80 × 25 mm", w: 80, h: 25 },
    { id: "80x45", label: "80 × 45 mm", w: 80, h: 45 },
    { id: "50x25", label: "50 × 25 mm", w: 50, h: 25 },
    { id: "40x30", label: "40 × 30 mm", w: 40, h: 30 },
    { id: "58x40", label: "58 × 40 mm", w: 58, h: 40 },
    { id: "60x40", label: "60 × 40 mm", w: 60, h: 40 },
    { id: "custom", label: "Personalizado", w: 0, h: 0 },
];

// ── Impresión: HTML independiente dentro de un iframe aislado ──────────────
// El documento del iframe vive en about:srcdoc → sin URL, sin título de pestaña,
// y con @page margin:0 Chrome no tiene dónde dibujar encabezado/pie (hora, ruta,
// nombre del sistema). En la etiqueta SOLO salen los campos seleccionados.

const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function barcodeSvgString(value: string, height: number, moduleWidth: number, showText: boolean, textFontSize?: number): string {
    const seq = encodeCode128(value);
    const bars: string[] = [];
    let x = 0;
    for (let i = 0; i < seq.length; i += 2) {
        const barW = seq[i] * moduleWidth;
        const spaceW = (seq[i + 1] || 0) * moduleWidth;
        bars.push(`<rect x="${x}" y="0" width="${barW}" height="${height}" fill="black"/>`);
        x += barW + spaceW;
    }
    const totalW = x;
    const textH = showText ? Math.max(12, (textFontSize || 9) + 2) : 0;
    const quiet = 10 * moduleWidth;
    const text = showText
        ? `<text x="${totalW / 2}" y="${height + textH - 2}" text-anchor="middle" font-size="${textFontSize || textH - 3}" font-family="monospace" font-weight="600" fill="black">${escapeHtml(value)}</text>`
        : "";
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" ` +
        `viewBox="${-quiet} 0 ${totalW + quiet * 2} ${height + textH}" ` +
        `preserveAspectRatio="xMidYMid meet" style="display:block">` +
        `<rect x="${-quiet}" y="0" width="${totalW + quiet * 2}" height="${height + textH}" fill="white"/>` +
        bars.join("") + text + `</svg>`
    );
}

function buildPrintHtml(opts: {
    labels: LabelProduct[];
    fields: LabelFields;
    dims: { w: number; h: number };
    nameSize: number;
    refSize: number;
    barcodeH: number;
    bigBarcodeText?: boolean;
}): string {
    const { labels, fields, dims, nameSize, refSize, barcodeH, bigBarcodeText } = opts;
    const showText = dims.h >= 25;

    const pages = labels.map(p => {
        const header = (fields.name || fields.internal_reference)
            ? `<div class="hdr">` +
              (fields.name ? `<div class="t-name" style="font-size:${nameSize}pt">${escapeHtml(p.name)}</div>` : "") +
              (fields.internal_reference && p.internal_reference
                  ? `<div class="t-ref" style="font-size:${refSize}pt">${escapeHtml(p.internal_reference)}</div>`
                  : "") +
              `</div>`
            : "";
        const barcode = fields.barcode
            ? `<div class="bc-wrap">${barcodeSvgString(p.barcode, barcodeH, 1.05, showText, bigBarcodeText ? 10 : undefined)}</div>`
            : "";
        const category = fields.category && p.category_name
            ? `<div class="t-cat" style="font-size:${refSize}pt">${escapeHtml(p.category_name)}</div>`
            : "";
        return `<div class="label-page${bigBarcodeText ? " big" : ""}">${header}${barcode}${category}</div>`;
    }).join("");

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title> </title>
<style>
    @page { size: ${dims.w}mm ${dims.h}mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { background: #fff; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
    .label-page {
        width: ${dims.w}mm;
        height: ${dims.h}mm;
        display: flex;
        flex-direction: column;
        gap: 0.3mm;
        padding: 0.8mm;
        overflow: hidden;
        break-inside: avoid;
        page-break-after: always;
    }
    .label-page:last-child { page-break-after: auto; }
    .hdr { text-align: center; line-height: 1; min-height: 0; }
    .label-page.big .t-name { text-wrap: balance; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .label-page.big .t-ref { text-wrap: balance; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .t-name { font-weight: 700; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .t-ref { color: #444; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .t-cat { color: #444; text-align: center; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bc-wrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .bc-wrap svg { width: 100%; height: 100%; }
</style>
</head>
<body>${pages}</body>
</html>`;
}

export function LabelGenerator({
    open,
    onClose,
    products,
}: {
    open: boolean;
    onClose: () => void;
    products: LabelProduct[];
}) {
    const [selected, setSelected] = useState<Record<string, number>>({});
    const [fields, setFields] = useState<LabelFields>({
        name: true, barcode: true, internal_reference: true, category: false,
    });
    const [preset, setPreset] = useState("80x25");
    const [customW, setCustomW] = useState(50);
    const [customH, setCustomH] = useState(25);
    const [copiesPerProduct, setCopiesPerProduct] = useState(1);
    const [productSearch, setProductSearch] = useState("");
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    if (!open) return null;

    const dims = preset === "custom"
        ? { w: customW, h: customH }
        : LABEL_PRESETS.find(p => p.id === preset) || LABEL_PRESETS[0];

    const allProducts = products;
    const selectedList = allProducts.filter(p => selected[p.id]);
    const totalLabels = selectedList.reduce((acc, p) => acc + (selected[p.id] || 1) * copiesPerProduct, 0);

    // Buscador inteligente: nombre / código de barras / referencia interna.
    // Sin useMemo: este punto queda DESPUÉS del early-return del modal, donde
    // los hooks están prohibidos (Rules of Hooks). products llega ya
    // memoizado desde el padre y el filter sobre ~cientos de items es trivial.
    const q = productSearch.trim().toLowerCase();
    const filteredProducts = !q
        ? allProducts
        : allProducts.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.barcode || "").includes(q) ||
            ((p as any).internal_reference || "").toLowerCase().includes(q)
        );

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = { ...prev };
            if (next[id]) delete next[id];
            else next[id] = 1;
            return next;
        });
    };

    const selectAll = () => {
        // Selecciona lo visible según el filtro del buscador
        const all: Record<string, number> = {};
        filteredProducts.forEach(p => { all[p.id] = 1; });
        setSelected(all);
    };

    // mm → px para el preview (96dpi ≈ 3.78px/mm)
    const pxW = dims.w * 3.78;
    const pxH = dims.h * 3.78;

    // 80×45 (papel del cliente): texto BIEN grande — nombre 16pt (hasta 2 líneas),
    // ref/categoría 11pt; el barcode absorbe el alto restante y sigue legible
    const bigText = dims.w >= 80 && dims.h >= 45;
    const nameSize = bigText ? 16 : dims.h >= 30 ? 8 : 6.5;
    const refSize = bigText ? 11 : dims.h >= 30 ? 6.5 : 5.5;
    // Altura de barras: barcode-only ocupa casi toda la etiqueta
    const barcodeOnly = !fields.name && !fields.internal_reference && !fields.category;
    const barcodeH = barcodeOnly ? Math.max(50, dims.h * 2.4) : Math.max(35, dims.h * 1.4);

    const print = () => {
        // Lista plana: cada etiqueta = una página exacta del tamaño elegido
        const labels: LabelProduct[] = [];
        selectedList.forEach(p => {
            const n = (selected[p.id] || 1) * copiesPerProduct;
            for (let i = 0; i < n; i++) labels.push(p);
        });
        if (labels.length === 0) return;

        const html = buildPrintHtml({ labels, fields, dims, nameSize, refSize, barcodeH, bigBarcodeText: bigText });

        // Iframe oculto fuera de pantalla: documento aislado (about:srcdoc)
        let iframe = iframeRef.current;
        if (!iframe || !document.body.contains(iframe)) {
            iframe = document.createElement("iframe");
            iframe.setAttribute("aria-hidden", "true");
            iframe.style.cssText =
                `position:fixed;left:-10000px;top:0;width:${Math.round(pxW)}px;height:${Math.round(pxH)}px;border:0;`;
            iframeRef.current = iframe;
        }
        const el = iframe;
        const cleanup = () => setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
            if (iframeRef.current === el) iframeRef.current = null;
        }, 500);

        el.addEventListener("load", () => {
            setTimeout(() => {
                try {
                    const win = el.contentWindow;
                    if (!win) return;
                    win.addEventListener("afterprint", cleanup);
                    win.focus();
                    win.print();
                    setTimeout(cleanup, 30000); // red de seguridad si afterprint no dispara
                } catch {
                    cleanup();
                }
            }, 100);
        }, { once: true });

        document.body.appendChild(el);
        el.srcdoc = html;
    };

    return (
        <>
            {/* ── Panel de configuración (pantalla) ── */}
            <div id="label-config-panel" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
                        <div className="flex items-center gap-2">
                            <Tag className="h-5 w-5 text-primary" />
                            <h3 className="font-bold">Generador de Etiquetas</h3>
                            <span className="text-xs text-muted-foreground">
                                {selectedList.length} productos · {totalLabels} etiquetas
                            </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* Configuración */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Tamaño etiqueta</label>
                                <select
                                    value={preset}
                                    onChange={e => setPreset(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                                >
                                    {LABEL_PRESETS.map(p => (
                                        <option key={p.id} value={p.id}>{p.label}</option>
                                    ))}
                                </select>
                                {preset === "custom" && (
                                    <div className="flex gap-2">
                                        <input type="number" value={customW} onChange={e => setCustomW(+e.target.value)}
                                            placeholder="ancho mm" className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
                                        <input type="number" value={customH} onChange={e => setCustomH(+e.target.value)}
                                            placeholder="alto mm" className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
                                        <span className="text-[10px] text-muted-foreground self-center">mm</span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Campos a incluir</label>
                                <div className="space-y-1.5">
                                    {([
                                        ["name", "Nombre"],
                                        ["barcode", "Código de barras"],
                                        ["internal_reference", "Referencia interna"],
                                        ["category", "Categoría"],
                                    ] as [keyof LabelFields, string][]).map(([k, label]) => (
                                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="checkbox" checked={fields[k]}
                                                onChange={e => setFields(f => ({ ...f, [k]: e.target.checked }))}
                                                className="h-4 w-4" />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Copias por producto</label>
                                <input type="number" min={1} max={100} value={copiesPerProduct}
                                    onChange={e => setCopiesPerProduct(Math.max(1, +e.target.value || 1))}
                                    className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                                <p className="text-[10px] text-muted-foreground">
                                    Tip: pon las copias igual al stock de cada producto para etiquetar todo.
                                </p>
                            </div>
                        </div>

                        {/* Lista de productos */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase">
                                    Productos ({selectedList.length}/{allProducts.length})
                                </label>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={selectAll}>Seleccionar todos</Button>
                                    <Button variant="outline" size="sm" onClick={() => setSelected({})}>Limpiar</Button>
                                </div>
                            </div>
                            {/* Buscador inteligente (nombre / código de barras / referencia interna) */}
                            <div className="relative mb-2">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, código o referencia..."
                                    className="form-input pl-11"
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                />
                                {productSearch && (
                                    <button
                                        onClick={() => setProductSearch("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        title="Limpiar búsqueda"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                                {filteredProducts.map(p => (
                                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm">
                                        <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} className="h-4 w-4" />
                                        <span className="flex-1 truncate">{p.name}</span>
                                        <span className="text-xs text-muted-foreground font-mono">{p.barcode}</span>
                                    </label>
                                ))}
                                {filteredProducts.length === 0 && (
                                    <p className="p-4 text-center text-xs text-muted-foreground">
                                        {allProducts.length === 0 ? "Sin productos" : "Sin resultados para esa búsqueda"}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Preview de una etiqueta */}
                        {selectedList.length > 0 && (
                            <div>
                                <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Vista previa (1ª etiqueta)</label>
                                <div className="flex justify-center p-4 bg-muted/40 rounded-xl">
                                    <div style={{ width: pxW, height: pxH }} className="bg-white border border-gray-300 overflow-hidden flex flex-col p-[2px] gap-[1px]">
                                        {(fields.name || fields.internal_reference) && (
                                            <div className="text-center leading-none min-h-0">
                                                {fields.name && (
                                                    <div className="font-bold" style={{
                                                        fontSize: `${nameSize}pt`,
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: bigText ? 2 : 1,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                        textWrap: "balance",
                                                    }}>
                                                        {selectedList[0].name}
                                                    </div>
                                                )}
                                                {fields.internal_reference && selectedList[0].internal_reference && (
                                                    <div className="text-gray-600" style={{
                                                        fontSize: `${refSize}pt`,
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                        textWrap: "balance",
                                                    }}>
                                                        {selectedList[0].internal_reference}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {fields.barcode && (
                                            <div className="flex-1 flex items-center justify-center min-h-0">
                                                <BarcodeSVG value={selectedList[0].barcode} height={barcodeH} moduleWidth={1.05} showText={dims.h >= 25} textFontSize={bigText ? 10 : undefined} />
                                            </div>
                                        )}
                                        {fields.category && selectedList[0].category_name && (
                                            <div className="text-center leading-none truncate text-gray-600" style={{ fontSize: `${refSize}pt` }}>
                                                {selectedList[0].category_name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 p-4 border-t border-border">
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={print} disabled={selectedList.length === 0} className="gap-2">
                            <Printer className="h-4 w-4" />
                            Imprimir {totalLabels} etiquetas
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

export { BarcodeSVG };
