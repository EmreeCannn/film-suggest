import express from "express";
import { tmdb } from "../services/tmdb.js";
import prisma from "../lib/prisma.js";
import { optionalAuthMiddleware } from "./auth.js";

const router = express.Router();

/* ---------------------------------------------
   YOUTUBE → WATCH FORMAT
--------------------------------------------- */
function convertToWatchUrl(idOrUrl) {
  if (!idOrUrl) return null;

  if (!idOrUrl.includes("youtube"))
    return `https://www.youtube.com/watch?v=${idOrUrl}`;

  const idFromEmbed = idOrUrl.match(/embed\/([^?]+)/);
  if (idFromEmbed) return `https://www.youtube.com/watch?v=${idFromEmbed[1]}`;

  const idFromWatch = idOrUrl.match(/watch\\?v=([^&]+)/);
  if (idFromWatch) return `https://www.youtube.com/watch?v=${idFromWatch[1]}`;

  return null;
}

/* ---------------------------------------------
    TEK FİLM OBJECT (FORMAT BOZULMADAN)
--------------------------------------------- */
function buildMovieObject(data, videos, providers) {
  const cast = (data.credits?.cast || [])
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null,
    }));

  const director =
    (data.credits?.crew || []).find((p) => p.job === "Director")?.name || null;

  const certification =
    data.release_dates?.results
      ?.find((r) => r.iso_3166_1 === "US")
      ?.release_dates?.[0]?.certification || null;

  let videoUrl = null;
  let videoSource = null;

  const tmdbMp4 = videos.find(
    (v) => v.site === "TMDB" && v.url?.endsWith(".mp4")
  );

  if (tmdbMp4) {
    videoUrl = tmdbMp4.url;
    videoSource = "tmdb_mp4";
  } else {
    const yt = videos.find(
      (v) => v.site === "YouTube" && v.type === "Trailer"
    );
    if (yt) {
      videoUrl = convertToWatchUrl(yt.key);
      videoSource = "youtube";
    }
  }

  if (!videoUrl) return null;

  const us = providers?.results?.US || {};

  const mapProviders = (list, type) =>
    !list
      ? []
      : list.map((p) => ({
        name: p.provider_name,
        type,
        logo: p.logo_path
          ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
          : null,
      }));

  const platforms = [
    ...mapProviders(us.flatrate, "subscription"),
    ...mapProviders(us.buy, "buy"),
    ...mapProviders(us.rent, "rent"),
    ...mapProviders(us.ads, "ads"),
  ];

  return {
    id: data.id,
    title: data.title,
    overview: data.overview,
    year: data.release_date?.split("-")[0] || "N/A",
    rating: data.vote_average,
    runtime: data.runtime,
    certification,
    director,
    genres: data.genres?.map((g) => g.name) || [],
    cast,
    poster: data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : null,
    backdrop: data.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
      : null,
    platforms,
    platformLink: us.link || null,
    videoUrl,
    videoSource,
  };
}

// Apply middleware to all routes in this router
router.use(optionalAuthMiddleware);

/* ---------------------------------------------
    /api/all?page=X  (TIKTOK RANDOM FEED)
--------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const userIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const user = req.user; // Populated by optionalAuthMiddleware
    const isPremium = user?.plan === "premium";
    const LIMIT = 20;

    // --- 1. LIMIT CHECK ---
    if (!isPremium) {
      let currentCount = 0;
      let lastReset = new Date();

      if (user) {
        // Logged in Free User
        currentCount = user.dailyCount;
        lastReset = user.lastResetDate;
      } else {
        // Guest User
        let guest = await prisma.guestUsage.findUnique({ where: { ip: userIp } });
        if (!guest) {
          guest = await prisma.guestUsage.create({ data: { ip: userIp } });
        }
        currentCount = guest.dailyCount;
        lastReset = guest.lastResetDate;
      }

      // Check date reset
      const today = new Date();
      if (
        today.getDate() !== lastReset.getDate() ||
        today.getMonth() !== lastReset.getMonth() ||
        today.getFullYear() !== lastReset.getFullYear()
      ) {
        // Reset needed (will be done during increment, but logically count is 0 now)
        currentCount = 0;
      }

      if (currentCount >= LIMIT) {
        return res.status(403).json({
          error: "Günlük 20 film limitini doldurdun knk.",
          limit: LIMIT,
          isPremium: false
        });
      }
    }

    // --- 2. FETCH MOVIES ---
    // Optimize: Fetch only 1 page (20 items) based on random seed or client page
    const page = Number(req.query.page) || 1;
    // Use a random page offset to keep it fresh if page=1 is requested repeatedly? 
    // Or trust client to send incrementing pages. 
    // User wants "Reels" feel, so random is good.
    // Let's use the client page but add some randomness if it's the first page.

    // Actually, to avoid duplicates, we should respect the page number.
    // But to make it "Reels" like, we want popular movies.

    const tmdbResponse = await tmdb.get("/discover/movie", {
      params: {
        sort_by: "popularity.desc",
        page: page,
        include_adult: false,
        vote_count_gte: 100,
        "with_watch_monetization_types": "flatrate|rent|buy",
        with_original_language: "en",
      },
    });

    let movies = tmdbResponse.data.results || [];

    // Filter basic requirements
    movies = movies.filter(
      (m) =>
        m.poster_path &&
        m.backdrop_path &&
        m.overview?.length > 10
    );

    // Shuffle slightly
    movies = movies.sort(() => Math.random() - 0.5);

    // Limit to 5-10 to prevent timeout during hydration
    // Hydrating 20 movies takes time. Let's try 10.
    const moviesToHydrate = movies.slice(0, 10);

    const hydratePromises = moviesToHydrate.map((m) =>
      tmdb
        .get(`/movie/${m.id}`, {
          params: {
            append_to_response: "credits,videos,release_dates,watch/providers",
          },
        })
        .then((full) =>
          buildMovieObject(
            full.data,
            full.data.videos?.results || [],
            full.data["watch/providers"]
          )
        )
        .catch(() => null)
    );

    const hydratedResults = await Promise.all(hydratePromises);
    const validResults = hydratedResults.filter((m) => m !== null && m.videoUrl);

    // --- 3. INCREMENT LIMIT ---
    if (!isPremium && validResults.length > 0) {
      const incrementAmount = validResults.length;
      const today = new Date();

      if (user) {
        // Update User
        // Check if reset needed
        const lastReset = new Date(user.lastResetDate);
        const isNewDay = today.getDate() !== lastReset.getDate() ||
          today.getMonth() !== lastReset.getMonth() ||
          today.getFullYear() !== lastReset.getFullYear();

        const newCount = isNewDay ? incrementAmount : user.dailyCount + incrementAmount;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            dailyCount: newCount,
            lastResetDate: today // Update date to now
          }
        });
      } else {
        // Update Guest
        const guest = await prisma.guestUsage.findUnique({ where: { ip: userIp } });
        // Guest should exist because we checked/created above, but safe check
        if (guest) {
          const lastReset = new Date(guest.lastResetDate);
          const isNewDay = today.getDate() !== lastReset.getDate() ||
            today.getMonth() !== lastReset.getMonth() ||
            today.getFullYear() !== lastReset.getFullYear();

          const newCount = isNewDay ? incrementAmount : guest.dailyCount + incrementAmount;

          await prisma.guestUsage.update({
            where: { ip: userIp },
            data: {
              dailyCount: newCount,
              lastResetDate: today
            }
          });
        }
      }
    }

    return res.json({
      page,
      count: validResults.length,
      movies: validResults,
    });

  } catch (err) {
    console.error("ALL FEED ERROR:", err.message);
    return res.status(500).json({ error: "Sunucu hatası knk" });
  }
});

export default router;
