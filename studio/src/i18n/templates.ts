import type { Locale } from "./config";

interface TemplateMessages {
  label: string;
  classic: string;
  ozil: string;
  preview: string;
  caption: string;
  idea: string;
}

export const TEMPLATE_MESSAGES: Record<Locale, TemplateMessages> = {
  en: { label: "Page template", classic: "Classic", ozil: "Ozil", preview: "A little preview", caption: "Your next idea, in the frame.", idea: "It starts with an idea" },
  es: { label: "Plantilla de página", classic: "Clásica", ozil: "Ozil", preview: "Un pequeño vistazo", caption: "Tu próxima idea, en imagen.", idea: "Todo empieza con una idea" },
  fr: { label: "Modèle de page", classic: "Classique", ozil: "Ozil", preview: "Un petit aperçu", caption: "Votre prochaine idée prend forme.", idea: "Tout commence par une idée" },
  de: { label: "Seitenvorlage", classic: "Klassisch", ozil: "Ozil", preview: "Ein kleiner Einblick", caption: "Deine nächste Idee im Bild.", idea: "Es beginnt mit einer Idee" },
  pt: { label: "Modelo de página", classic: "Clássico", ozil: "Ozil", preview: "Uma pequena prévia", caption: "Sua próxima ideia, em cena.", idea: "Tudo começa com uma ideia" },
  it: { label: "Modello di pagina", classic: "Classico", ozil: "Ozil", preview: "Una piccola anteprima", caption: "La tua prossima idea prende forma.", idea: "Tutto inizia con un’idea" },
  ja: { label: "ページテンプレート", classic: "クラシック", ozil: "Ozil", preview: "プレビュー", caption: "次のアイデアを、かたちに。", idea: "アイデアから始まる" },
  ko: { label: "페이지 템플릿", classic: "클래식", ozil: "Ozil", preview: "미리 보기", caption: "다음 아이디어를 화면 속으로.", idea: "아이디어에서 시작하세요" },
  zh: { label: "页面模板", classic: "经典红黑", ozil: "Ozil 蓝白", preview: "灵感预览", caption: "让下一个想法，成为画面。", idea: "从一个想法开始" },
};
