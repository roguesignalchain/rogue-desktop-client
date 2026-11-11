import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { changeLanguage } from "../i18n";
import { ChevronDown } from "lucide-react";
import { US, ES, CN } from "country-flag-icons/react/3x2";

const languages = [
  { code: "es", label: "Español", Flag: ES },
  { code: "en", label: "English", Flag: US },
  { code: "zh", label: "中文", Flag: CN },
] as const;

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative font-mono text-xs select-none" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center space-x-2 px-2.5 py-1.5 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/15 hover:border-white/30 rounded-[2px] text-zinc-300 hover:text-white transition"
        title="Select Language / Seleccionar Idioma"
      >
        <currentLang.Flag className="w-4 h-3 rounded-[1px] object-cover" />
        <span className="font-semibold uppercase text-[11px]">{currentLang.code}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-32 bg-[#0A0A0C] border border-white/20 rounded-[2px] shadow-2xl py-1 z-50 animate-in fade-in duration-100">
          {languages.map((lang) => {
            const isSelected = i18n.language === lang.code;
            const FlagIcon = lang.Flag;
            return (
              <button
                key={lang.code}
                onClick={() => {
                  changeLanguage(lang.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-left text-xs transition ${
                  isSelected
                    ? "bg-white text-black font-bold"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <FlagIcon className="w-4 h-3 rounded-[1px] object-cover shrink-0" />
                <span className="text-[11px] truncate">{lang.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
