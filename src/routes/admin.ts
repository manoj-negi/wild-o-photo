import { Router, type Request } from "express";

import photos from "../data/admin-photos";
import categories from "../data/categories";
import type { AdminPhoto, MetaItem } from "../types/admin";

const router = Router();

const slugify = (s: string): string =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const asArray = (v: unknown): string[] =>
  v === undefined ? [] : Array.isArray(v) ? (v as string[]) : [v as string];

// meta_key[] / meta_value[] come from the dynamic metadata rows
const readMeta = (body: Request["body"]): MetaItem[] =>
  asArray(body.meta_key)
    .map((k, i): MetaItem => ({ key: String(k).trim(), value: String(asArray(body.meta_value)[i] || "").trim() }))
    .filter(m => m.key);

const readPhoto = (body: Request["body"]): Omit<AdminPhoto, "live"> => ({
  cap: (body.cap || "").trim(),
  slug: slugify(body.slug || body.cap),
  title: (body.title || "").trim(),
  ref: (body.ref || "").trim(),
  category: (body.category || "").trim(),
  collection: (body.collection || "").trim(),
  camera: (body.camera || "").trim(),
  date: (body.date || "").trim(),
  about: (body.about || "").trim(),
  altNote: (body.altNote || "").trim(),
  src: (body.src || "").trim(),
  alt: (body.alt || "").trim(),
  l: body.l || "", t: body.t || "", w: body.w || "", h: body.h || "",
  views: asArray(body.views),
  meta: readMeta(body)
});

const blankPhoto = (): AdminPhoto => ({
  cap: "", slug: "", title: "", ref: "", category: "", collection: "", camera: "",
  date: "", about: "", altNote: "", src: "", alt: "",
  l: "", t: "", w: "", h: "", live: true, views: ["Flow", "Grid"],
  meta: [
    { key: "Camera", value: "" },
    { key: "Lens", value: "" },
    { key: "Settings", value: "" },
    { key: "Location", value: "" }
  ]
});

router.get("/", (req, res) => res.redirect("/admin/photos"));

// ---- Photos ----------------------------------------------------------------

router.get("/photos", (req, res) => {
  res.render("photos", { nav: "photos", photos, categories, flash: req.query.flash || "" });
});

router.get("/photos/new", (req, res) => {
  res.render("photo-form", { nav: "add", mode: "add", photo: blankPhoto(), categories });
});

router.get("/photos/:slug/edit", (req, res) => {
  const photo = photos.find(p => p.slug === req.params.slug);
  if (!photo) return res.status(404).send("Photo not found");
  res.render("photo-form", { nav: "photos", mode: "edit", photo, categories });
});

router.post("/photos", (req, res) => {
  const p = readPhoto(req.body);
  if (!p.slug) return res.redirect("/admin/photos/new");
  const live = req.body.live !== "draft";
  photos.push({ ...p, live });
  res.redirect("/admin/photos?flash=Photo+added");
});

router.post("/photos/:slug", (req, res) => {
  const i = photos.findIndex(p => p.slug === req.params.slug);
  if (i === -1) return res.status(404).send("Photo not found");
  photos[i] = { ...photos[i], ...readPhoto(req.body), live: req.body.live !== "draft" };
  res.redirect("/admin/photos?flash=Photo+saved");
});

router.post("/photos/:slug/toggle", (req, res) => {
  const p = photos.find(x => x.slug === req.params.slug);
  if (p) p.live = !p.live;
  res.redirect("/admin/photos");
});

router.post("/photos/:slug/delete", (req, res) => {
  const i = photos.findIndex(p => p.slug === req.params.slug);
  if (i > -1) photos.splice(i, 1);
  res.redirect("/admin/photos?flash=Photo+deleted");
});

// ---- Categories ------------------------------------------------------------

router.get("/categories", (req, res) => {
  const sel = Math.min(Math.max(parseInt(String(req.query.sel || "0"), 10) || 0, 0), Math.max(categories.length - 1, 0));
  res.render("categories", { nav: "categories", photos, categories, sel, flash: req.query.flash || "" });
});

router.post("/categories", (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) return res.redirect("/admin/categories");
  categories.push({
    title,
    parent: req.body.parent || "None",
    description: (req.body.description || "").trim()
  });
  res.redirect("/admin/categories?sel=" + (categories.length - 1) + "&flash=Category+created");
});

router.post("/categories/:index", (req, res) => {
  const i = parseInt(req.params.index, 10);
  if (!categories[i]) return res.status(404).send("Category not found");
  categories[i] = {
    title: (req.body.title || "").trim() || categories[i].title,
    parent: req.body.parent || "None",
    description: (req.body.description || "").trim()
  };
  res.redirect("/admin/categories?sel=" + i + "&flash=Category+saved");
});

router.post("/categories/:index/delete", (req, res) => {
  const i = parseInt(req.params.index, 10);
  if (categories[i]) categories.splice(i, 1);
  res.redirect("/admin/categories?flash=Category+deleted");
});

export default router;
