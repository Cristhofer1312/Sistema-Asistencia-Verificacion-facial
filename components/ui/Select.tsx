"use client";
import React, { useState, useRef, useEffect } from "react";

interface SelectProps {
  value?: any;
  onChange?: (e: { target: { value: any } }) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  required?: boolean;
  /** Muestra un buscador dentro de la lista (p. ej. empleados por nombre o cédula). */
  searchable?: boolean;
  searchPlaceholder?: string;
}

// Texto plano de un label JSX: `{nombre} ({cedula})` llega como arreglo de fragmentos.
function textoDe(n: React.ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join("");
  if (React.isValidElement(n)) return textoDe((n.props as any).children);
  return "";
}

// Sin mayúsculas ni acentos: "perez" encuentra "Pérez".
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Sin puntos, guiones ni espacios: "12345678" encuentra "V-12.345.678".
const compactar = (s: string) => s.replace(/[\s.\-]/g, "");

export function Select({ value, onChange, children, style, className, id, required, searchable, searchPlaceholder }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
    else if (searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const options: {value: any, label: React.ReactNode}[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    
    if (child.type === 'option') {
      options.push({ value: (child as any).props.value, label: (child as any).props.children });
    } else if (child.type === React.Fragment || Array.isArray(child)) {
      React.Children.forEach((child as any).props?.children || child, subChild => {
        if (React.isValidElement(subChild) && subChild.type === 'option') {
          options.push({ value: (subChild as any).props.value, label: (subChild as any).props.children });
        }
      });
    } else {
      // In case they pass a mapped array directly as children (common in React)
      const childArray = Array.isArray(child) ? child : [child];
      React.Children.forEach(childArray, (item: any) => {
        if (Array.isArray(item)) {
           React.Children.forEach(item, (subItem: any) => {
             if (React.isValidElement(subItem) && subItem.type === 'option') {
               options.push({ value: (subItem as any).props.value, label: (subItem as any).props.children });
             }
           });
        }
        else if (React.isValidElement(item) && item.type === 'option') {
          options.push({ value: (item as any).props.value, label: (item as any).props.children });
        }
      });
    }
  });

  const selectedOption = options.find(o => String(o.value) === String(value)) || options.find(o => String(o.value) === "") || options[0];

  const q = normalizar(query.trim());
  const visibles = !searchable || !q
    ? options
    : options.filter(o => {
        if (String(o.value) === "") return false; // el "Seleccione…" no es un resultado
        const t = normalizar(textoDe(o.label));
        return t.includes(q) || compactar(t).includes(compactar(q));
      });

  function elegir(v: any) {
    if (onChange) onChange({ target: { value: v } });
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", ...style }} className={className} ref={ref}>
      <div 
        onClick={() => setOpen(!open)}
        style={{
          padding: "8px 36px 8px 12px",
          borderRadius: "var(--r-md)",
          border: open ? "1.5px solid var(--brand)" : "1.5px solid var(--border-2)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: ".8125rem",
          fontWeight: 500,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "100%",
          minWidth: 120,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedOption?.label}
        </span>
        <span style={{ fontSize: ".7rem", color: "var(--muted)", position: "absolute", right: 12, transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
      </div>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%", left: 0, right: 0,
          marginTop: 6,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--sh-lg)",
          zIndex: 50,
          maxHeight: 250,
          overflowY: "auto",
          display: "flex", flexDirection: "column"
        }}>
          {searchable && (
            <div style={{ position: "sticky", top: 0, padding: 8, background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter") {
                    e.preventDefault(); // no enviar el formulario que contiene el select
                    if (visibles.length > 0) elegir(visibles[0].value);
                  }
                }}
                placeholder={searchPlaceholder ?? "Buscar…"}
                aria-label={searchPlaceholder ?? "Buscar"}
                style={{ width: "100%" }}
              />
            </div>
          )}
          {searchable && visibles.length === 0 && (
            <div className="muted" style={{ padding: "10px 14px", fontSize: ".8125rem" }}>Sin resultados</div>
          )}
          {visibles.map((o, i) => {
            const isSelected = String(value) === String(o.value);
            return (
              <div
                key={i}
                onClick={() => elegir(o.value)}
                style={{
                  padding: "10px 14px",
                  fontSize: ".8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  background: isSelected ? "var(--brand-l)" : "transparent",
                  color: isSelected ? "var(--brand)" : "var(--ink-2)",
                  transition: "background .15s"
                }}
                onMouseEnter={e => e.currentTarget.style.background = isSelected ? "var(--brand-l)" : "var(--surface-2)"}
                onMouseLeave={e => e.currentTarget.style.background = isSelected ? "var(--brand-l)" : "transparent"}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
