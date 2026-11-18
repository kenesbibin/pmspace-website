import { Metadata } from "next";
import CadPdfExtractorPage from "./CadPdfExtractorPage";
import { FAQSchema } from "@/components/SEOSchemas";

const PAGE_URL = "https://pmspace.ai/tools/cad-pdf-extractor/";

export const metadata: Metadata = {
  title: "Free CAD PDF Extractor | Rooms, Measurements & Doors/Windows | Space AI",
  description:
    "Upload CAD PDF floor plans and extract room labels, dimensions, areas, doors, windows, drawing previews and diagnostics. Free CAD PDF extractor with PyMuPDF and Tesseract OCR — no signup required.",
  keywords: [
    "free CAD PDF extractor",
    "CAD floor plan extractor",
    "PDF room extraction",
    "construction drawing OCR",
    "floor plan room detection",
    "CAD PDF to JSON",
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "Free CAD PDF Extractor | Space AI",
    description:
      "Extract room labels, dimensions, areas, doors and windows from CAD PDF floor plans. Vector and scanned drawings supported.",
    url: PAGE_URL,
    type: "website",
  },
};

const faqs = [
  {
    question: "Is the CAD PDF Extractor really free?",
    answer:
      "Yes. The CAD PDF Extractor is free to use with no signup, account, or payment required.",
  },
  {
    question: "What types of PDF drawings are supported?",
    answer:
      "Vector CAD exports with selectable text and scanned or image-only floor plans are supported. Scanned drawings use Tesseract OCR when the text layer is missing.",
  },
  {
    question: "Does it calculate room areas and dimensions?",
    answer:
      "Printed room dimensions are read directly from the drawing when present. Areas are only calculated from drawing geometry when an explicit scale such as SCALE 1:100 is found. Overall drawing dimensions do not establish individual room areas.",
  },
  {
    question: "Are doors and windows counted?",
    answer:
      "Door and window counts come from a door/window schedule when present, numbered tags such as D1 or W1 on the drawing, or readable DOOR/WINDOW labels — in that priority order. Unlabelled doors and windows are not guessed.",
  },
  {
    question: "Is my drawing private?",
    answer:
      "The PDF is processed only for your extraction request and is not stored permanently. Avoid uploading drawings that you are not permitted to share with the service.",
  },
  {
    question: "Can I export the results?",
    answer:
      "Yes. You can download the complete structured extraction, including room analysis, as a JSON file.",
  },
];

export default function Page() {
  return (
    <>
      <FAQSchema faqs={faqs} />
      <CadPdfExtractorPage />
    </>
  );
}
