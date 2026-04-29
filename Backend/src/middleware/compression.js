import { brotliCompressSync, constants as zlibConstants, gzipSync } from "zlib";

const DEFAULT_MIN_BYTES = 1024;
const COMPRESSIBLE_TYPES = [
  "application/json",
  "application/javascript",
  "application/xml",
  "image/svg+xml",
  "text/",
];

const isCompressibleContentType = (value = "") => {
  const normalized = String(value).toLowerCase();
  return COMPRESSIBLE_TYPES.some((type) => normalized.includes(type));
};

const resolveEncoding = (acceptEncoding = "") => {
  const normalized = String(acceptEncoding).toLowerCase();
  if (normalized.includes("br")) return "br";
  if (normalized.includes("gzip")) return "gzip";
  return "";
};

export const compressionMiddleware = ({ minBytes = DEFAULT_MIN_BYTES } = {}) => {
  return (req, res, next) => {
    const encoding = resolveEncoding(req.headers["accept-encoding"]);
    if (!encoding) return next();

    const originalSend = res.send.bind(res);

    res.send = (body) => {
      if (
        res.headersSent ||
        req.method === "HEAD" ||
        res.statusCode < 200 ||
        res.statusCode === 204 ||
        res.statusCode === 304 ||
        res.getHeader("Content-Encoding") ||
        res.getHeader("Cache-Control") === "no-transform"
      ) {
        return originalSend(body);
      }

      const contentType = String(res.getHeader("Content-Type") || "");
      if (!isCompressibleContentType(contentType)) {
        return originalSend(body);
      }

      const buffer =
        Buffer.isBuffer(body)
          ? body
          : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));

      if (buffer.byteLength < minBytes) {
        return originalSend(body);
      }

      try {
        const compressed =
          encoding === "br"
            ? brotliCompressSync(buffer, {
                params: {
                  [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
                },
              })
            : gzipSync(buffer, { level: 6 });

        if (compressed.byteLength >= buffer.byteLength) {
          return originalSend(body);
        }

        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("Content-Encoding", encoding);
        res.setHeader("Content-Length", String(compressed.byteLength));
        return originalSend(compressed);
      } catch {
        return originalSend(body);
      }
    };

    next();
  };
};
