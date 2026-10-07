import { PHOTO_LIMITS, reasonSchema } from "@av/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { HttpError, param, parse, str, unprocessable } from "../lib/http.js";
import { MANAGERS, requireRole } from "../middleware/auth.js";
import { clearWorkerDocument, getPhoto, jobItemPhotoFile, setWorkerDocument, workerDocumentFile, listPhotos, photoFile, removeJobItemPhoto, restorePhoto, sharePhoto, uploadJobItemPhotos, uploadPhotos, voidPhoto, type PhotoVariant } from "../services/photos.js";

/** Return photos: upload, gallery, files, watermarked share copy, void. */
export const photosRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMITS.maxBytes, files: PHOTO_LIMITS.maxFiles, fields: 10 },
}).array("photos", PHOTO_LIMITS.maxFiles);

/** Multer errors become clear 422s instead of 500s. */
function receivePhotos(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const name = (err as multer.MulterError & { file?: { originalname?: string } }).file?.originalname;
      const messages: Partial<Record<multer.ErrorCode, string>> = {
        LIMIT_FILE_SIZE: `${name ? `${name}: the photo` : "A photo"} is larger than 15 MB`,
        LIMIT_FILE_COUNT: `Upload at most ${PHOTO_LIMITS.maxFiles} photos at a time`,
        LIMIT_UNEXPECTED_FILE: `Photos must be sent in the "photos" field (at most ${PHOTO_LIMITS.maxFiles})`,
      };
      return next(unprocessable(messages[err.code] ?? "The upload couldn't be read"));
    }
    next(err instanceof HttpError ? err : unprocessable("The upload couldn't be read"));
  });
}

photosRouter.post("/returns/:id/photos", receivePhotos, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.status(201).json(await uploadPhotos(param(req.params.id), files, str(req.body?.returnLineId), req.user));
});

photosRouter.post("/job-items/:id/photos", receivePhotos, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.status(201).json(await uploadJobItemPhotos(param(req.params.id), str(req.body?.kind), files, req.user));
});

for (const variant of ["thumb", "display", "original"] as PhotoVariant[]) {
  photosRouter.get(`/job-photos/:id/${variant}`, async (req, res) => {
    const f = await jobItemPhotoFile(param(req.params.id), variant);
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Disposition", `inline; filename="${f.filename}"`);
    await new Promise<void>((resolve, reject) => {
      f.stream.on("error", reject).on("end", resolve);
      f.stream.pipe(res);
    });
  });
}

// Worker profile photo and Aadhaar images (one current image per slot).
const receiveOne = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_LIMITS.maxBytes, files: 1, fields: 5 } }).single("photo");
function receiveOnePhoto(req: Request, res: Response, next: NextFunction) {
  receiveOne(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) return next(unprocessable(err.code === "LIMIT_FILE_SIZE" ? "The photo is larger than 15 MB" : 'Send one photo in the "photo" field'));
    next(err instanceof HttpError ? err : unprocessable("The upload couldn't be read"));
  });
}

photosRouter.post("/clients/:id/documents/:slot", receiveOnePhoto, async (req, res) => {
  res.json(await setWorkerDocument(param(req.params.id), param(req.params.slot), req.file, req.user));
});

photosRouter.post("/clients/:id/documents/:slot/remove", async (req, res) => {
  res.json(await clearWorkerDocument(param(req.params.id), param(req.params.slot), req.user));
});

for (const variant of ["thumb", "display", "original"] as PhotoVariant[]) {
  photosRouter.get(`/worker-documents/:id/${variant}`, async (req, res) => {
    const f = await workerDocumentFile(param(req.params.id), variant, req.user);
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Disposition", `inline; filename="${f.filename}"`);
    await new Promise<void>((resolve, reject) => {
      f.stream.on("error", reject).on("end", resolve);
      f.stream.pipe(res);
    });
  });
}

photosRouter.post("/job-photos/:id/remove", async (req, res) => {
  res.json(await removeJobItemPhoto(param(req.params.id), req.user));
});

const intParam = (v: unknown) => {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) throw unprocessable(`"${s}" is not a valid number`);
  return n;
};

photosRouter.get("/photos", async (req, res) => {
  res.json(
    await listPhotos(
      {
        clientId: str(req.query.clientId),
        jobId: str(req.query.jobId),
        designId: str(req.query.designId),
        productId: str(req.query.productId),
        jobWorkTypeId: str(req.query.jobWorkTypeId),
        returnId: str(req.query.returnId),
        from: str(req.query.from),
        to: str(req.query.to),
        minRate: intParam(req.query.minRate),
        maxRate: intParam(req.query.maxRate),
        includeVoided: req.query.includeVoided === "true",
        cursor: str(req.query.cursor),
        take: intParam(req.query.take),
      },
      req.user,
    ),
  );
});

photosRouter.get("/photos/:id", async (req, res) => {
  res.json(await getPhoto(param(req.params.id), req.user));
});

for (const variant of ["thumb", "display", "original"] as PhotoVariant[]) {
  photosRouter.get(`/photos/:id/${variant}`, async (req, res) => {
    const f = await photoFile(param(req.params.id), variant, req.user);
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Disposition", `inline; filename="${f.filename}"`);
    await new Promise<void>((resolve, reject) => {
      f.stream.on("error", reject).on("end", resolve);
      f.stream.pipe(res);
    });
  });
}

photosRouter.get("/photos/:id/share", async (req, res) => {
  const { buffer, filename } = await sharePhoto(param(req.params.id), req.user);
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

photosRouter.post("/photos/:id/void", requireRole(...MANAGERS), async (req, res) => {
  res.json(await voidPhoto(param(req.params.id), parse(reasonSchema, req.body).reason, req.user));
});

photosRouter.post("/photos/:id/restore", requireRole("OWNER"), async (req, res) => {
  res.json(await restorePhoto(param(req.params.id), parse(reasonSchema, req.body).reason, req.user));
});
