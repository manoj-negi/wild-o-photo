import { Router } from "express";

import photos from "../data/site-photos";
import cameras from "../data/cameras";
import details from "../data/details";

const router = Router();

router.get("/", (req, res) => {
  res.render("index", { title: "Of Wild & Walls", photos, cameras });
});

router.get("/grid", (req, res) => {
  res.render("grid", { title: "Of Wild & Walls", photos, cameras });
});

router.get("/photo/:slug", (req, res) => {
  const photo = photos.find(p => p.slug === req.params.slug);
  const detail = details[req.params.slug];
  if (!photo || !detail) return res.status(404).send("Photo not found");

  res.render("detail", { title: photo.cap, photo, photos, cameras, details: detail });
});

export default router;
