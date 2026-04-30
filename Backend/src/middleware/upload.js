import multer from 'multer';

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/gif',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-matroska'
]);

export const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 20
    },
    fileFilter: (_req, file, cb) => {
        const mimeType = String(file?.mimetype || '').toLowerCase();
        if (!mimeType || ALLOWED_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
            return cb(null, true);
        }

        return cb(new Error('Unsupported file type'));
    }
});

