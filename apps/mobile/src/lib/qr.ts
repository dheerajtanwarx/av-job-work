import QRCode from "qrcode";

/** QR code as an SVG string (no canvas needed), for screens (react-native-svg SvgXml) and printed PDFs alike. */
export function qrSvg(text: string, size = 240, dark = "#18181b", light = "#ffffff") {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const margin = 2;
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
  const box = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
