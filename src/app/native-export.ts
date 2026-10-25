import { registerPlugin } from '@capacitor/core';

const ClaimExport = registerPlugin<{ savePdf(options: { fileName: string; data: string }): Promise<{ saved: boolean }> }>('ClaimExport');

export async function saveNativePdf(pdf: Blob, fileName: string): Promise<void> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.readAsDataURL(pdf);
  });
  await ClaimExport.savePdf({ fileName, data });
}
