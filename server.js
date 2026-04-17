import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

const API_KEY = "AIzaSyC_UMdX8GXMFtNdzTFEyeRSoBpihnJRrEk";

// 🔥 GOOGLE SHEET CSV
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR5DvuIvno97yrcOv87g0JG00XQSYEtPcQKXmuUKmgaUnIGXsnGHoAcufNffWaVq1dMCVvGOMHP6bOo/pub?output=csv";


// 🔥 WIB TIME
function getWIB(){
  const now = new Date();
  return new Date(now.getTime() + (7 * 60 * 60 * 1000));
}


// ================= GET VIDEO IDS + CATEGORY =================
async function getVideoData(){

  const res = await fetch(SHEET_URL);
  const text = await res.text();

  const rows = text.split("\n").slice(1);

  const videos = rows.map(r=>{

    // 🔥 FIX CSV (ANTI KOMA ERROR)
    const cols = r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

    const link = (cols[2] || "").trim();
    const category = (cols[3] || "").trim();

    if(!link) return null;

    let id;

    if(link.includes("v=")){
      id = link.split("v=")[1];
    }else{
      id = link.split("/").pop();
    }

    return {
      id: id.split("?")[0],
      category: category || "Others"
    };

  }).filter(Boolean);

  return videos;
}


// ================= FETCH YOUTUBE =================
async function fetchYouTubeData(){

  try{

    const VIDEO_LIST = await getVideoData();
    const VIDEO_IDS = VIDEO_LIST.map(v => v.id);

    if(VIDEO_IDS.length === 0){
      console.log("No video IDs");
      return;
    }

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${VIDEO_IDS.join(",")}&key=${API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    let history = {};

    if(fs.existsSync("data.json")){
      history = JSON.parse(fs.readFileSync("data.json"));
    }

    const now = getWIB();
    const hour = now.getHours();
    const today = now.toISOString().split("T")[0];

    // 🔥 RESET CONTROL
    let lastResetDate = null;

    if(fs.existsSync("reset.json")){
      const resetData = JSON.parse(fs.readFileSync("reset.json"));
      lastResetDate = resetData.lastResetDate;
    }

    if(hour === 11 && lastResetDate !== today){

      console.log("🔥 RESET SEKALI JAM 11");

      Object.keys(history).forEach(id => {
        history[id] = [];
      });

      fs.writeFileSync("reset.json", JSON.stringify({
        lastResetDate: today
      }));
    }

    data.items.forEach(video => {

      const id = video.id;
      const views = Number(video.statistics.viewCount);

      // 🔥 ambil category dari sheet
      const meta = VIDEO_LIST.find(v => v.id === id);
      const category = meta?.category || "Others";

      if(!history[id]){
        history[id] = [];
      }

      history[id].push({
        time: now,
        views: views,
        title: video.snippet.title,
        thumbnail: video.snippet.thumbnails.high.url,
        category: category // 🔥 TAMBAHAN
      });

      history[id] = history[id].slice(-24);

    });

    fs.writeFileSync("data.json", JSON.stringify(history, null, 2));

    console.log("UPDATED:", now);

  }catch(err){
    console.log("ERROR FETCH:", err);
  }
}


// ================= AUTO RUN =================
fetchYouTubeData();
setInterval(fetchYouTubeData, 3600000);


// ================= API =================
app.get("/data", (req, res) => {

  try{

    if(fs.existsSync("data.json")){
      const data = JSON.parse(fs.readFileSync("data.json"));
      res.json(data);
    }else{
      res.json({});
    }

  }catch(err){
    res.json({});
  }

});


// ================= START SERVER =================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
