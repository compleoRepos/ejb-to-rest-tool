/**
 * File upload handler using multer.
 * Handles ZIP/JAR/WAR uploads for the Adapter generator
 * and JSON descriptor uploads for the BIAN generator.
 */
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import os from "os";

const UPLOAD_DIR = path.join(os.tmpdir(), "ejb-to-rest-uploads");

// Ensure upload directory exists
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = [".zip", ".jar", ".war", ".json", ".wsdl", ".xml"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

export const uploadRouter = Router();

/**
 * POST /api/upload/ejb — Upload EJB project ZIP/JAR/WAR files
 */
uploadRouter.post("/ejb", upload.array("files", 50), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const results = files.map((f) => ({
      originalName: f.originalname,
      storedPath: f.path,
      size: f.size,
      format: path.extname(f.originalname).replace(".", ""),
    }));

    res.json({ success: true, files: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upload/json — Upload JSON descriptor files
 */
uploadRouter.post("/json", upload.array("files", 50), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const results = [];
    for (const f of files) {
      const content = await fs.readFile(f.path, "utf-8");
      let parsed: any = null;
      let endpoints = 0;

      if (f.originalname.endsWith(".json")) {
        try {
          parsed = JSON.parse(content);
          endpoints = parsed.endpoints?.length || 0;
        } catch {
          // Invalid JSON, still accept the file
        }
      }

      results.push({
        originalName: f.originalname,
        storedPath: f.path,
        size: f.size,
        format: path.extname(f.originalname).replace(".", ""),
        endpoints,
        adapterName: parsed?.adapter_name || f.originalname.replace(/\.[^.]+$/, ""),
      });
    }

    res.json({ success: true, files: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { UPLOAD_DIR };
