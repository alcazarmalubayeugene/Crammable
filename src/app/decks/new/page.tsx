import { PdfUploadFlow } from "@/components/upload/PdfUploadFlow";
import { App } from "@/lib/contracts";

export const metadata = {
  title: `PDF test — ${App.name}`,
};

export default function NewDeckPage() {
  return (
    <div className="flex flex-1 flex-col px-6 py-12">
      <PdfUploadFlow />
    </div>
  );
}
