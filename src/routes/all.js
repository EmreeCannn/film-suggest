import express from "express";
import { tmdb } from "../services/tmdb.js";
import prisma from "../lib/prisma.js";
import { optionalAuthMiddleware } from "./auth.js";

const router = express.Router();

/* ---------------------- HELPERS ---------------------- */
function isToday(date) {
  const d = new Date(date);
  const t = new Date();
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  );
}

function convertToWatchUrl(raw) {
  if (!raw) return null;
  if (!raw.includes("youtube"))
    return `https://www.youtube.com/watch?v=${raw}`;

  const embed = raw.match(/embed\/([^?]+)/);
  if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`;

  const w = raw.match(/watch\\?v=([^&]+)/);
  if (w) return `https://www.youtube.com/watch?v=${w[1]}`;

  return null;
}

function buildMovie(data, videos) {
  const yt = videos.find(v => v.site === "YouTube" && v.type === "Trailer");
  if (!yt) return null;

  return {
    id: data.id,
    title: data.title,
    overview: data.overview,
    year: data.release_date?.split("-")[0] || "N/A",
    rating: data.vote_average,
    runtime: data.runtime,
    certification:
      data.release_dates?.results
        ?.find(r => r.iso_3166_1 === "US")
        ?.release_dates?.[0]?.certification || null,
    director:
      (data.credits?.crew || []).find(c => c.job === "Director")?.name || null,
    genres: data.genres?.map(g => g.name) || [],
    cast: (data.credits?.cast || []).slice(0, 10).map(p => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null,
    })),
    poster: data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : null,
    backdrop: data.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
      : null,
    platforms: [],
    platformLink: null,
    videoUrl: convertToWatchUrl(yt.key),
    videoSource: "youtube",
  };
}

/* ---------------------- MAIN ---------------------- */
router.use(optionalAuthMiddleware);

router.get("/", async (req, res) => {
  try {
    const LIMIT = 30;
    const MAX_PER_REQUEST = 10;

    let isPremium = false;
    let dailyCount = 0;
    let lastReset = new Date();
    let userId = null;

    /* ---------------- USER ---------------- */
    if (req.user) {
      const fresh = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { plan: true, dailyCount: true, lastResetDate: true },
      });

      if (fresh) {
        isPremium = fresh.plan === "premium";
        dailyCount = fresh.dailyCount;
        lastReset = fresh.lastResetDate;
        userId = req.user.id;
      }
    }

    /* ---------------- GUEST ---------------- */
    let guestId = null;

    if (!userId) {
      guestId = req.headers["x-guest-id"];

      if (!guestId) {
        return res.status(400).json({
          error: "x-guest-id header gerekli knk (örnek: test1234)",
        });
      }

      let guest = await prisma.guest.findUnique({ where: { id: guestId } });

      if (!guest) {
        guest = await prisma.guest.create({
          data: { id: guestId },
        });
      }

      dailyCount = guest.dailyCount;
      lastReset = guest.lastReset;
    }

    /* ---------------- RESET COUNTER ---------------- */
    if (!isToday(lastReset)) {
      dailyCount = 0;
    }

    /* ---------------- LIMIT BLOCK ---------------- */
    if (!isPremium && dailyCount >= LIMIT) {
      return res.status(403).json({
        error: "Günlük 30 film limitini doldurdun knk.",
        limit: LIMIT,
        remaining: 0,
        isPremium: false,
      });
    }

   /* ---------------- FETCH MOVIES ---------------- */
const page = Number(req.query.page) || 1;

const seedId = userId || guestId;
const seedNum = [...seedId].reduce((s, c) => s + c.charCodeAt(0), 0);

// kullanıcıya özel random page
const randomPage = ((page * 37 + seedNum) % 500) + 1;

const tmdbRes = await tmdb.get("/discover/movie", {
  params: {
    sort_by: "popularity.desc",
    include_adult: false,
    page: randomPage,
    vote_count_gte: 100,
    with_original_language: "en",
  },
});

let movies = tmdbRes.data.results.filter(
  (m) => m.poster_path && m.backdrop_path && m.overview?.length > 10
);

    /* ---------------- HYDRATE ---------------- */
    const hydrateCount = isPremium
      ? Math.min(20, movies.length)
      : Math.min(MAX_PER_REQUEST, LIMIT - dailyCount);

    const hydrated = await Promise.all(
      movies.slice(0, hydrateCount).map(m =>
        tmdb
          .get(`/movie/${m.id}`, {
            params: {
              append_to_response:
                "credits,videos,release_dates,watch/providers",
            },
          })
          .then(full => buildMovie(full.data, full.data.videos?.results || []))
          .catch(() => null)
      )
    );

    const finalMovies = hydrated.filter(Boolean);

    /* ---------------- UPDATE LIMIT ---------------- */
    const increase = finalMovies.length;

    if (!isPremium && increase > 0) {
      const now = new Date();
      const newCount = dailyCount + increase;

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { dailyCount: newCount, lastResetDate: now },
        });
      } else {
        await prisma.guest.update({
          where: { id: guestId },
          data: { dailyCount: newCount, lastReset: now },
        });
      }
    }

    /* ---------------- RETURN ---------------- */
    return res.json({
      page,
      count: finalMovies.length,
      movies: finalMovies,
      limit: isPremium ? null : LIMIT,
      remaining: isPremium ? null : LIMIT - (dailyCount + increase),
      isPremium,
      hasMore: isPremium || dailyCount + increase < LIMIT,
    });
  } catch (err) {
    console.error("ALL FEED ERROR:", err);
    return res.status(500).json({ error: "Sunucu hatası knk" });
  }
});

export default router;
