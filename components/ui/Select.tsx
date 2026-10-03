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
}

export function Select({ value, onChange, children, style, className, id, required }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          {options.map((o, i) => {
            const isSelected = String(value) === String(o.value);
            return (
              <div 
                key={i}
                onClick={() => { 
                  if (onChange) onChange({ target: { value: o.value } });
                  setOpen(false); 
                }}
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
