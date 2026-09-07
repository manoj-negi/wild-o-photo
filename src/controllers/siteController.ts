import pool from "../db";
import { Request, Response } from "express";
import { RowDataPacket } from "mysql2";

// ── DB row shapes ────────────────────────────────────────────────────────────

interface DBPhotoRow extends RowDataPacket {
  id: number;
  title: string;
  cap: string;
  slug: string;
  ref: string;
  url: string;
  s3_key: string;
  alt: string;
  category: string;
  collection: string;
  camera: string;
  date: string;
  description: string;
  alt_note?: string;
  l: string;
  t: string;
  w: string;
  h: string;
  live: number | boolean;
  views: any;
  metadata: any;
}

interface DBCameraRow extends RowDataPacket {
  id: number;
  brand: string;
  model: string;
}

interface DBCollectionRow extends RowDataPacket {
  name: string;
  description: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const buildPhotoUrl = (row: DBPhotoRow): string => {
  if (row.url) return row.url;
  if (row.s3_key) {
    const bucket = process.env.AWS_S3_BUCKET_NAME || "";
    const region = process.env.AWS_REGION || "us-east-1";
    return row.s3_key.startsWith("http")
      ? row.s3_key
      : `https://${bucket}.s3.${region}.amazonaws.com/${row.s3_key}`;
  }
  return "";
};

/** Parse the JSON metadata column into a flat key→value map */
const parseMeta = (raw: any): Record<string, string> => {
  let arr: any[] = [];
  if (!raw) return {};
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return {}; }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "object") {
    arr = Object.values(raw);
  }
  const map: Record<string, string> = {};
  arr.forEach(m => {
    if (m && typeof m === "object") {
      const k = String((m as any).key || (m as any).name || "").trim();
      const v = String((m as any).value || "").trim();
      if (k) { map[k] = v; map[k.toLowerCase()] = v; }
    }
  });
  return map;
};

/** Parse the JSON views column */
const parseViews = (raw: any): string[] => {
  if (!raw) return ["Flow", "Grid"];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return ["Flow", "Grid"]; }
  }
  return ["Flow", "Grid"];
};

/**
 * Map a DB row into the shape the site views & API expect.
 * All numeric l/t/w/h are returned as numbers (vw units).
 */
const mapToSitePhoto = (
  row: DBPhotoRow,
  collectionMap: Record<string, string> = {}
) => {
  const meta = parseMeta(row.metadata);
  const getMeta = (k: string) => meta[k] || meta[k.toLowerCase()] || "";
  const views = parseViews(row.views);
  const src = buildPhotoUrl(row);
  const collectionName = row.collection || "";

  return {
    // flow / grid positioning (keep as strings in DB, expose as numbers)
    l: parseFloat(row.l) || 0,
    t: parseFloat(row.t) || 0,
    w: parseFloat(row.w) || 0,
    h: parseFloat(row.h) || 0,
    // identity
    slug: row.slug || "",
    src,
    alt: row.alt || "",
    cap: row.cap || row.title || "",
    title: row.title || row.cap || "",
    ref: row.ref || "",
    // taxonomy
    category: row.category || "",
    collection: collectionName,
    // detail-panel fields
    about: row.description || "",
    altNote: row.alt_note || "",
    aboutCollection: collectionMap[collectionName] || "",
    camera: row.camera || getMeta("Camera"),
    lens: getMeta("Lens"),
    location: getMeta("Location"),
    settings: getMeta("Settings"),
    date: row.date || "",
    // flags
    live: Boolean(row.live),
    views,
  };
};

/**
 * Build the camera menu structure expected by footer.ejs:
 *   [{ brand, models: [{ name, count }] }]
 * count = number of live photos shot with that camera.
 */
const buildCameraMenu = (
  cameraRows: DBCameraRow[],
  photoCameras: string[]
) => {
  // count photos per camera string (case-insensitive match)
  const countMap: Record<string, number> = {};
  photoCameras.forEach(c => {
    const k = (c || "").trim().toLowerCase();
    if (k) countMap[k] = (countMap[k] || 0) + 1;
  });

  // group cameras by brand
  const brandMap: Record<string, { name: string; count: number }[]> = {};
  cameraRows.forEach(row => {
    const brand = row.brand || "Other";
    // The model column already contains the full name (e.g. "Sony α1", "Canon EOS R6")
    // The photos.camera column is also stored as the full model string.
    const name = (row.model || "").trim();
    const count = countMap[name.toLowerCase()] || 0;
    if (!brandMap[brand]) brandMap[brand] = [];
    brandMap[brand].push({ name, count });
  });

  return Object.entries(brandMap).map(([brand, models]) => ({ brand, models }));
};

// ── Rendered page handlers ───────────────────────────────────────────────────

/** GET / — flow view */
const getFlow = async (req: Request, res: Response) => {
  try {
    const [photoRows] = await pool.query<DBPhotoRow[]>(
      `SELECT * FROM photos WHERE live = 1
        AND (JSON_CONTAINS(views, '"Flow"') OR JSON_LENGTH(views) = 0 OR views IS NULL)
       ORDER BY id DESC`
    );
    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );
    const [camRows] = await pool.query<DBCameraRow[]>(
      "SELECT id, brand, model FROM cameras ORDER BY id ASC"
    );

    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    const photos = photoRows.map(r => mapToSitePhoto(r, collectionMap));
    const photoCameras = photoRows.map(r => r.camera || "");
    const cameras = buildCameraMenu(camRows, photoCameras);

    res.render("index", { title: "Of Wild & Walls", photos, cameras });
  } catch (err) {
    console.error("Error rendering flow page:", err);
    res.status(500).send("Error loading page");
  }
};

/** GET /grid — grid view */
const getGrid = async (req: Request, res: Response) => {
  try {
    const [photoRows] = await pool.query<DBPhotoRow[]>(
      `SELECT * FROM photos WHERE live = 1
        AND (JSON_CONTAINS(views, '"Grid"') OR JSON_LENGTH(views) = 0 OR views IS NULL)
       ORDER BY id DESC`
    );
    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );
    const [camRows] = await pool.query<DBCameraRow[]>(
      "SELECT id, brand, model FROM cameras ORDER BY id ASC"
    );

    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    const photos = photoRows.map(r => mapToSitePhoto(r, collectionMap));
    const photoCameras = photoRows.map(r => r.camera || "");
    const cameras = buildCameraMenu(camRows, photoCameras);

    res.render("grid", { title: "Of Wild & Walls", photos, cameras });
  } catch (err) {
    console.error("Error rendering grid page:", err);
    res.status(500).send("Error loading page");
  }
};

/** GET /photo/:slug — detail view */
const getPhotoDetail = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<DBPhotoRow[]>(
      "SELECT * FROM photos WHERE slug = ? AND live = 1",
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).send("Photo not found");

    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );
    // all live photos for the thumbnail rail
    const [allPhotoRows] = await pool.query<DBPhotoRow[]>(
      "SELECT * FROM photos WHERE live = 1 ORDER BY id DESC"
    );
    const [camRows] = await pool.query<DBCameraRow[]>(
      "SELECT id, brand, model FROM cameras ORDER BY id ASC"
    );

    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    const buildDetails = (r: DBPhotoRow) => {
      const m = parseMeta(r.metadata);
      const gM = (k: string) => m[k] || m[k.toLowerCase()] || "";
      return {
        kicker: r.category || "Photography",
        title: r.cap || r.title || "",
        ref: r.ref || "",
        about: r.description || "",
        altNote: r.alt_note || "",
        collection: collectionMap[r.collection || ""] || r.collection || "",
        collectionHref: "#",
        camera: r.camera || gM("Camera"),
        lens: gM("Lens"),
        date: r.date || "",
        location: gM("Location"),
        category: r.category || "",
        settings: gM("Settings"),
      };
    };

    const photo = mapToSitePhoto(rows[0], collectionMap);
    const photos = allPhotoRows.map(r => ({
      ...mapToSitePhoto(r, collectionMap),
      details: buildDetails(r)
    }));
    const photoCameras = allPhotoRows.map(r => r.camera || "");
    const cameras = buildCameraMenu(camRows, photoCameras);

    // Build the details object the detail.ejs panel expects
    const d = rows[0];
    const meta = parseMeta(d.metadata);
    const getMeta = (k: string) => meta[k] || meta[k.toLowerCase()] || "";

    const details = {
      kicker: d.category || "Photography",
      title: d.cap || d.title || "",
      ref: d.ref || "",
      about: d.description || "",
      altNote: d.alt_note || "",
      collection: collectionMap[d.collection || ""] || d.collection || "",
      collectionHref: "#",
      camera: d.camera || getMeta("Camera"),
      lens: getMeta("Lens"),
      date: d.date || "",
      location: getMeta("Location"),
      category: d.category || "",
      settings: getMeta("Settings"),
    };

    res.render("detail", {
      title: photo.cap,
      photo,
      photos,
      cameras,
      details,
    });
  } catch (err) {
    console.error("Error rendering detail page:", err);
    res.status(500).send("Error loading page");
  }
};

// ── JSON API endpoints ────────────────────────────────────────────────────────

/** GET /api/photos/flow — live photos tagged for the Flow view */
const getFlowAPI = async (req: Request, res: Response) => {
  try {
    const [photoRows] = await pool.query<DBPhotoRow[]>(
      `SELECT * FROM photos WHERE live = 1
        AND (JSON_CONTAINS(views, '"Flow"') OR JSON_LENGTH(views) = 0 OR views IS NULL)
       ORDER BY id DESC`
    );
    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );

    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    const photos = photoRows.map(r => mapToSitePhoto(r, collectionMap));
    res.json({ success: true, count: photos.length, photos });
  } catch (err) {
    console.error("API error /api/photos/flow:", err);
    res.status(500).json({ success: false, error: "Failed to fetch flow photos" });
  }
};

/** GET /api/photos/grid — live photos tagged for the Grid view */
const getGridAPI = async (req: Request, res: Response) => {
  try {
    const [photoRows] = await pool.query<DBPhotoRow[]>(
      `SELECT * FROM photos WHERE live = 1
        AND (JSON_CONTAINS(views, '"Grid"') OR JSON_LENGTH(views) = 0 OR views IS NULL)
       ORDER BY id DESC`
    );
    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );

    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    const photos = photoRows.map(r => mapToSitePhoto(r, collectionMap));
    res.json({ success: true, count: photos.length, photos });
  } catch (err) {
    console.error("API error /api/photos/grid:", err);
    res.status(500).json({ success: false, error: "Failed to fetch grid photos" });
  }
};

/** GET /api/photos — all live photos (both views) */
const getPhotosAPI = async (req: Request, res: Response) => {
  try {
    const view = String(req.query.view || "").trim().toLowerCase(); // 'flow' | 'grid' | ''
    const category = String(req.query.category || "").trim();
    const collection = String(req.query.collection || "").trim();
    const q = String(req.query.q || req.query.search || "").trim().toLowerCase();

    let sql = "SELECT * FROM photos WHERE live = 1";
    const params: any[] = [];

    if (view === "flow") {
      sql += ` AND (JSON_CONTAINS(views, '"Flow"') OR JSON_LENGTH(views) = 0 OR views IS NULL)`;
    } else if (view === "grid") {
      sql += ` AND (JSON_CONTAINS(views, '"Grid"') OR JSON_LENGTH(views) = 0 OR views IS NULL)`;
    }
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    if (collection) {
      sql += " AND collection = ?";
      params.push(collection);
    }
    sql += " ORDER BY id DESC";

    const [photoRows] = await pool.query<DBPhotoRow[]>(sql, params);
    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );

    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    let photos = photoRows.map(r => mapToSitePhoto(r, collectionMap));

    // client-side text search after mapping
    if (q) {
      photos = photos.filter(p =>
        p.cap.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.collection.toLowerCase().includes(q) ||
        p.camera.toLowerCase().includes(q) ||
        p.lens.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.date.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, count: photos.length, photos });
  } catch (err) {
    console.error("API error /api/photos:", err);
    res.status(500).json({ success: false, error: "Failed to fetch photos" });
  }
};

/** GET /api/photos/:slug — single photo detail */
const getPhotoBySlugAPI = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<DBPhotoRow[]>(
      "SELECT * FROM photos WHERE slug = ? AND live = 1",
      [req.params.slug]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Photo not found" });
    }
    const [collRows] = await pool.query<DBCollectionRow[]>(
      "SELECT name, description FROM collections ORDER BY id ASC"
    );
    const collectionMap: Record<string, string> = {};
    collRows.forEach(c => { collectionMap[c.name] = c.description || ""; });

    const photo = mapToSitePhoto(rows[0], collectionMap);

    // extended detail fields
    const d = rows[0];
    const meta = parseMeta(d.metadata);
    const getMeta = (k: string) => meta[k] || meta[k.toLowerCase()] || "";

    const details = {
      kicker: d.category || "Photography",
      title: d.cap || d.title || "",
      ref: d.ref || "",
      about: d.description || "",
      altNote: d.alt_note || "",
      collection: collectionMap[d.collection || ""] || d.collection || "",
      collectionHref: "#",
      camera: d.camera || getMeta("Camera"),
      lens: getMeta("Lens"),
      date: d.date || "",
      location: getMeta("Location"),
      category: d.category || "",
      settings: getMeta("Settings"),
    };

    res.json({ success: true, photo: { ...photo, details } });
  } catch (err) {
    console.error("API error /api/photos/:slug:", err);
    res.status(500).json({ success: false, error: "Failed to fetch photo" });
  }
};

/** GET /api/cameras — camera menu data for the site footer */
const getCamerasAPI = async (req: Request, res: Response) => {
  try {
    const [camRows] = await pool.query<DBCameraRow[]>(
      "SELECT id, brand, model FROM cameras ORDER BY id ASC"
    );
    const [photoRows] = await pool.query<RowDataPacket[]>(
      "SELECT camera FROM photos WHERE live = 1"
    );
    const photoCameras = photoRows.map(r => String(r.camera || ""));
    const cameras = buildCameraMenu(camRows, photoCameras);
    res.json({ success: true, count: cameras.length, cameras });
  } catch (err) {
    console.error("API error /api/cameras:", err);
    res.status(500).json({ success: false, error: "Failed to fetch cameras" });
  }
};

/** GET /api/lenses — distinct lenses used in live photos, with count */
const getLensesAPI = async (req: Request, res: Response) => {
  try {
    // Pull the raw lenses from the lenses table for the brand grouping
    const [lensRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, brand, model FROM lenses ORDER BY id ASC"
    );
    // Count usage: scan metadata of every live photo
    const [photoRows] = await pool.query<DBPhotoRow[]>(
      "SELECT metadata FROM photos WHERE live = 1"
    );

    // Build a count map keyed by the lens string as stored in metadata
    const countMap: Record<string, number> = {};
    photoRows.forEach(r => {
      const meta = parseMeta(r.metadata);
      const lens = (meta["Lens"] || meta["lens"] || "").trim();
      if (lens) countMap[lens.toLowerCase()] = (countMap[lens.toLowerCase()] || 0) + 1;
    });

    // Group lenses by brand using the lenses table
    const brandMap: Record<string, { name: string; count: number }[]> = {};
    lensRows.forEach((row: any) => {
      const brand = (row.brand || "Other").trim();
      // model column stores the full lens name (may include brand prefix)
      const name = (row.model || "").trim();
      const count = countMap[name.toLowerCase()] || 0;
      if (!brandMap[brand]) brandMap[brand] = [];
      brandMap[brand].push({ name, count });
    });

    const lenses = Object.entries(brandMap).map(([brand, models]) => ({ brand, models }));
    res.json({ success: true, count: lenses.length, lenses });
  } catch (err) {
    console.error("API error /api/lenses:", err);
    res.status(500).json({ success: false, error: "Failed to fetch lenses" });
  }
};


/** GET /api/categories — all categories with live photo count */
const getCategoriesAPI = async (req: Request, res: Response) => {
  try {
    const [catRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name AS title, parent, description FROM categories ORDER BY name ASC"
    );
    // Count live photos per category
    const [photoRows] = await pool.query<RowDataPacket[]>(
      "SELECT category FROM photos WHERE live = 1"
    );
    const countMap: Record<string, number> = {};
    photoRows.forEach(r => {
      const k = (r.category || "").trim().toLowerCase();
      if (k) countMap[k] = (countMap[k] || 0) + 1;
    });

    const categories = catRows.map(c => ({
      id: c.id,
      title: c.title || "",
      parent: c.parent || "",
      description: c.description || "",
      count: countMap[(c.title || "").toLowerCase()] || 0,
    }));

    res.json({ success: true, count: categories.length, categories });
  } catch (err) {
    console.error("API error /api/categories:", err);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
};

/** GET /api/collections — all collections with live photo count */
const getCollectionsAPI = async (req: Request, res: Response) => {
  try {
    const [collRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name AS title, description FROM collections ORDER BY name ASC"
    );
    // Count live photos per collection
    const [photoRows] = await pool.query<RowDataPacket[]>(
      "SELECT collection FROM photos WHERE live = 1"
    );
    const countMap: Record<string, number> = {};
    photoRows.forEach(r => {
      const k = (r.collection || "").trim().toLowerCase();
      if (k) countMap[k] = (countMap[k] || 0) + 1;
    });

    const collections = collRows.map(c => ({
      id: c.id,
      title: c.title || "",
      description: c.description || "",
      count: countMap[(c.title || "").toLowerCase()] || 0,
    }));

    res.json({ success: true, count: collections.length, collections });
  } catch (err) {
    console.error("API error /api/collections:", err);
    res.status(500).json({ success: false, error: "Failed to fetch collections" });
  }
};

export default {
  // rendered pages
  getFlow,
  getGrid,
  getPhotoDetail,
  // JSON APIs
  getFlowAPI,
  getGridAPI,
  getPhotosAPI,
  getPhotoBySlugAPI,
  getCamerasAPI,
  getLensesAPI,
  getCategoriesAPI,
  getCollectionsAPI,
};
