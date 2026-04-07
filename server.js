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


// ================= GET VIDEO IDS FROM SHEET =================
async function getVideoIds(){

  const res = await fetch(SHEET_URL);
  const text = await res.text();

  const rows = text.split("\n").slice(1);

  const ids = rows.map(r=>{
    const cols = r.replace("\r","").split(",");
    const link = cols[2];

    if(!link) return null;

    let id;

    if(link.includes("v=")){
      id = link.split("v=")[1];
    }else{
      id = link.split("/").pop();
    }

    return id.split("?")[0];

  }).filter(Boolean);

  return ids;
}


// ================= FETCH YOUTUBE =================
async function fetchYouTubeData(){

  try{

    const VIDEO_IDS = await getVideoIds();

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

    // 🔥 file khusus buat simpan reset
    let lastResetDate = null;

    if(fs.existsSync("reset.json")){
      const resetData = JSON.parse(fs.readFileSync("reset.json"));
      lastResetDate = resetData.lastResetDate;
    }

    // 🔥 RESET 1x JAM 11
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

      if(!history[id]){
        history[id] = [];
      }

      history[id].push({
        time: now,
        views: views,
        title: video.snippet.title,
        thumbnail: video.snippet.thumbnails.high.url
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
