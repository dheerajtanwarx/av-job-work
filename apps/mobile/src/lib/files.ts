import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { toast } from "@/components/ui/toast";
import { apiUrl, authHeaders, errorMessage } from "./api";

const MIME: Record<string, string> = { pdf: "application/pdf", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg" };

/**
 * Downloads an API file (PDF receipt, CSV/XLSX export, watermarked photo) with the session token and opens the
 * Android share sheet, so it can go to WhatsApp, Drive, a printer app, or be saved.
 */
export async function downloadAndShare(path: string, filename: string) {
  try {
    const dir = new Directory(Paths.cache, "shared");
    if (!dir.exists) dir.create();
    const dest = new File(dir, filename);
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(apiUrl(path), dest, { headers: authHeaders() });
    const ext = filename.split(".").pop() ?? "";
    await Sharing.shareAsync(file.uri, { mimeType: MIME[ext], dialogTitle: filename });
  } catch (e) {
    toast.error(`Couldn't download ${filename}: ${errorMessage(e)}`);
  }
}
