import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import feedRouter from "./routes/feed.js";
import allRouter from "./routes/all.js"
import router from "./routes/ai.js";
import trendingRoute from "./routes/trending.js";
import searchRouter from "./routes/search.js";
import aiMovieChat from "./routes/aiMovieChat.js";
import testDummy from "./routes/testDummy.js";

import authRouter from "./routes/auth.js";
dotenv.config();

const app = express();
// const prisma = new PrismaClient(); // Removed in favor of singleton import

app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(cors({
  credentials: true, // Cookie'ler için gerekli
  origin: true // Tüm origin'lere izin ver (production'da spesifik origin kullan)
}));
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60
}));



app.use("/api/ai", router);
// Secret kontrolü (tüm /api altında)
app.use("/api", (req, res, next) => {
   console.log("GELEN SECRET:", req.headers["x-app-secret"]);
  console.log("BEKLENEN:", process.env.APP_SECRET);
  const secret = req.headers["x-app-secret"];
  if (secret !== process.env.APP_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});



// Test
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend çalışıyor knk!" });
});

//  Ana feed endpoint'i buraya bağlıyorum
app.use("/api", feedRouter);

app.use("/api/all", allRouter);
app.use("/api/trending",trendingRoute);
app.use("/api/search",searchRouter);
app.use("/api/ai", aiMovieChat);
app.use("/api/dummy", testDummy);

app.use("/auth", authRouter);
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}

export default app;
