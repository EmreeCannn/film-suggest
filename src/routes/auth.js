import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";

const router = express.Router();

/* ============================================
   ENV
=============================================== */
const JWT_SECRET = process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;

/* ============================================
   JWT TOKEN ÜRETİCİ
=============================================== */
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      plan: user.plan,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/* ============================================
   AUTH MIDDLEWARE → Premium Upgrade için gerekli
=============================================== */
export const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Token gerekli." });

    const token = header.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) return res.status(401).json({ error: "Geçersiz kullanıcı." });

    req.user = user;
    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERR:", err);
    return res.status(401).json({ error: "Token geçersiz." });
  }
};

/* ============================================
   REGISTER
=============================================== */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "email ve password gerekli." });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists)
      return res.status(409).json({ error: "Bu email zaten kayıtlı." });

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashed, name }
    });

    return res.json({ user, token: createToken(user) });
  } catch (err) {
    console.error("REGISTER ERR:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* ============================================
   LOGIN
=============================================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.password)
      return res.status(401).json({ error: "Geçersiz bilgiler." });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Geçersiz bilgiler." });

    return res.json({ user, token: createToken(user) });
  } catch (err) {
    console.error("LOGIN ERR:", err);
    return res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* ============================================
   GOOGLE SIGN-IN
=============================================== */
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken)
      return res.status(400).json({ error: "idToken gerekli." });

    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;

    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user && email) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (!user) {
      user = await prisma.user.create({
        data: { googleId, email, name }
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId }
      });
    }

    return res.json({ user, token: createToken(user) });
  } catch (err) {
    console.error("GOOGLE LOGIN ERR:", err);
    return res.status(500).json({ error: "Google giriş hatası" });
  }
});

/* ============================================
   APPLE SIGN-IN (hazır ama client ID yoksa çalışmaz)
=============================================== */
// router.post("/apple", async (req, res) => {
//   try {
//     const { idToken } = req.body;

//     if (!APPLE_CLIENT_ID)
//       return res.status(500).json({ error: "APPLE_CLIENT_ID tanımlı değil" });

//     if (!idToken)
//       return res.status(400).json({ error: "idToken gerekli." });

//     const decoded = await appleSignin.verifyIdToken(idToken, {
//       audience: APPLE_CLIENT_ID,
//       ignoreExpiration: false
//     });

//     const appleId = decoded.sub;
//     const email = decoded.email ?? null;

//     let user = await prisma.user.findUnique({ where: { appleId } });

//     if (!user && email) {
//       user = await prisma.user.findUnique({ where: { email } });
//     }

//     if (!user) {
//       user = await prisma.user.create({
//         data: { appleId, email }
//       });
//     } else if (!user.appleId) {
//       user = await prisma.user.update({
//         where: { id: user.id },
//         data: { appleId }
//       });
//     }

//     return res.json({ user, token: createToken(user) });
//   } catch (err) {
//     console.error("APPLE LOGIN ERR:", err);
//     return res.status(500).json({ error: "Apple giriş hatası" });
//   }
// });

/* ============================================
   PREMIUM UPGRADE (Apple Pay veya Google IAP sonrası)
=============================================== */
router.post("/upgrade", authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { plan: "premium" }
    });

    return res.json({
      message: "Premium başarıyla aktif edildi knk 🎉",
      user: updated,
      token: createToken(updated)
    });

  } catch (err) {
    console.error("UPGRADE ERR:", err);
    return res.status(500).json({ error: "Premium yükseltme hatası" });
  }
});

export default router;
