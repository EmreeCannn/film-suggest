# 🔄 Free-Tier Movie Limit System Refactor - Migration Notes

## 📋 Overview

This document describes the refactoring of the `/api/all` endpoint to implement a clean, cookie-based guest tracking system and simplified limit enforcement.

---

## 🗄️ Database Schema Changes

### Removed Models
- `GuestUsage` (replaced with `Guest`)
- `UserViewedMovie` (removed - no longer tracking viewed movies)
- `GuestViewedMovie` (removed - no longer tracking viewed movies)

### New Model
```prisma
model Guest {
  id          String   @id @default(cuid())
  dailyCount  Int      @default(0)
  lastReset   DateTime @default(now())
}
```

### Updated Model
- `User` model: Removed `viewedMovies` relation (field still exists but relation removed)

---

## 📦 Dependencies

### Added
- `cookie-parser` - Required for cookie handling

### Installation
```bash
npm install cookie-parser
```

---

## 🔧 Code Changes

### 1. `src/index.js`
- Added `cookie-parser` middleware
- Updated CORS configuration to support cookies (`credentials: true`)

### 2. `src/routes/all.js` - Complete Rewrite

**Removed:**
- All IP-based tracking
- `viewedMovieIds` logic
- Advanced seed pagination
- Complex hydration limits
- GuestViewedMovie and UserViewedMovie tracking

**Added:**
- Cookie-based guest ID system (`fs_guest_id`)
- Simple daily reset logic
- Clean limit enforcement (before fetch)
- Simplified movie fetching
- Deterministic response structure

**Key Functions:**
- `getOrCreateGuestId()` - Manages guest cookie
- `isToday()` - Helper for date comparison
- Simplified flow: Identify → Reset → Enforce → Fetch → Hydrate → Limit → Update → Return

### 3. `src/routes/auth.js`
- No changes required (optionalAuthMiddleware still works)

---

## 🚀 Migration Steps

### Step 1: Install Dependencies
```bash
npm install cookie-parser
```

### Step 2: Update Prisma Schema
The schema has been updated. Run:
```bash
npx prisma migrate dev --name refactor_guest_system
```

**⚠️ WARNING:** This migration will:
- Drop `GuestUsage` table
- Drop `UserViewedMovie` table  
- Drop `GuestViewedMovie` table
- Create new `Guest` table

**Data Loss:** All viewed movie history will be lost. This is intentional as per requirements.

### Step 3: Generate Prisma Client
```bash
npx prisma generate
```

### Step 4: Test the Endpoint
```bash
# Test as guest (no auth)
curl http://localhost:3000/api/all \
  -H "x-app-secret: YOUR_SECRET" \
  -H "Cookie: fs_guest_id=test-id" \
  -v

# Test as logged-in free user
curl http://localhost:3000/api/all \
  -H "x-app-secret: YOUR_SECRET" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -v

# Test as premium user
curl http://localhost:3000/api/all \
  -H "x-app-secret: YOUR_SECRET" \
  -H "Authorization: Bearer PREMIUM_TOKEN" \
  -v
```

---

## 📊 API Response Changes

### New Response Fields
```json
{
  "page": 1,
  "count": 10,
  "movies": [...],
  "limit": 30,           // null for premium
  "remaining": 20,       // null for premium
  "isPremium": false
}
```

### Error Response (403 - Limit Reached)
```json
{
  "error": "Günlük 30 film limitini doldurdun. Premium'a geçerek sınırsız film izleyebilirsin! 🎬",
  "limit": 30,
  "currentCount": 30,
  "remaining": 0,
  "isPremium": false,
  "message": "Limit doldu. Yarın tekrar deneyebilir veya Premium'a geçebilirsin."
}
```

---

## 🔐 Cookie Configuration

The `fs_guest_id` cookie is set with:
- `httpOnly: true` - Prevents JavaScript access
- `secure: true` (production only) - HTTPS only
- `sameSite: "lax"` - CSRF protection
- `maxAge: 1 year` - Long-lived cookie

---

## ✅ Testing Checklist

- [ ] Guest user can fetch movies (cookie created)
- [ ] Guest user hits 30 movie limit
- [ ] Guest user gets 403 after limit
- [ ] Free logged-in user can fetch movies
- [ ] Free logged-in user hits 30 movie limit
- [ ] Premium user has unlimited access
- [ ] Daily reset works (test after midnight)
- [ ] Cookie persists across requests
- [ ] Multiple guests get different cookies
- [ ] Response includes limit/remaining fields

---

## 🐛 Known Issues / Considerations

1. **Cookie Support**: Frontend must support cookies (most modern frameworks do)
2. **CORS**: Ensure frontend origin is whitelisted in production
3. **Cookie Expiry**: 1 year expiry - guests will get new ID after expiry
4. **No Viewed History**: Users can see same movies again (by design)

---

## 📝 Code Quality Improvements

1. **Reduced Complexity**: ~478 lines → ~250 lines
2. **Single Responsibility**: Each function does one thing
3. **No IP Tracking**: Privacy-friendly
4. **Deterministic**: Same input = same output
5. **Production Ready**: Error handling, validation, clean code

---

## 🔄 Rollback Plan

If issues occur, you can rollback by:
1. Reverting `all.js` to previous version
2. Reverting schema changes
3. Running `npx prisma migrate reset` (⚠️ data loss)

---

## 📞 Support

For issues or questions, check:
- Prisma migration logs: `prisma/migrations/`
- Server logs for error messages
- Cookie inspection in browser DevTools

---

**Migration Date:** 2024-12-04  
**Version:** 2.0.0  
**Breaking Changes:** Yes (viewed movie tracking removed)

