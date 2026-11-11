import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./locales/es.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

const savedLanguage = typeof window !== "undefined" ? localStorage.getItem("rogue_lang") || "es" : "es";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: savedLanguage,
    fallbackLng: "es",
    interpolation: {
      escapeValue: false,
    },
  });

export const changeLanguage = (lng: "es" | "en" | "zh") => {
  i18n.changeLanguage(lng);
  if (typeof window !== "undefined") {
    localStorage.setItem("rogue_lang", lng);
  }
};

export default i18n;

