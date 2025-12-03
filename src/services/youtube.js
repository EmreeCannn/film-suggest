// src/services/youtube.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// 👉 named export olarak youtube veriyoruz
export const youtube = axios.create({
  baseURL: "https://www.googleapis.com/youtube/v3",
  params: {
    key: process.env.YOUTUBE_KEY
  }
});

