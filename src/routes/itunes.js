import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/", async (req, res) => {
  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ error: "query lazım knk" });
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=movie&country=us`;

  const r = await axios.get(url);

  res.json(r.data);
});

export default router;
