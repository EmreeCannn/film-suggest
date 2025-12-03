import express from "express";
const router = express.Router();

router.get("/dummy", (req, res) => {
  res.json({ message: "dummy endpoint çalışıyor knk!" });
});

export default router;
