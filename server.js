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

  const rows = text.trim().split(/\r?\n/).slice(1);

  console.log("ROWS:", rows.length);
  if(rows[0]) console.log("FIRST ROW:", rows[0]);

  const videos = rows.map(r=>{

    const cols = r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

    let link = (cols[2] || "").trim();

    if(!link){
      const found = cols.find(c => c.includes("youtu"));
      link = found ? found.trim() : "";
    }

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

  console.log("VIDEO_IDS:", videos.map(v => v.id));

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

    let history = {};

    if(fs.existsSync("data.json")){
      history = JSON.parse(fs.readFileSync("data.json"));
    }

    const now = getWIB();
    const hour = now.getHours();
    const today = now.toISOString().split("T")[0];

    let lastResetDate = null;

    if(fs.existsSync("reset.json")){
      const resetData = JSON.parse(fs.readFileSync("reset.json"));
      lastResetDate = resetData.lastResetDate;
    }

    // ================= RESET 11 WIB =================
    if(hour === 11 && lastResetDate !== today){

      console.log("🔥 RESET SEKALI JAM 11");

      // 🔥 simpan hasil daily kemarin
      const yesterdayData = {};

      Object.keys(history).forEach(id => {

        const arr = history[id];

        let total = 0;

        for(let i = 1; i < arr.length; i++){

          const current = arr[i].views || 0;
          const prev = arr[i - 1].views || 0;

          total += (current - prev);

        }

        yesterdayData[id] = total;

        // reset history baru
        history[id] = [];

      });

      fs.writeFileSync(
        "daily.json",
        JSON.stringify(yesterdayData, null, 2)
      );

      fs.writeFileSync("reset.json", JSON.stringify({
        lastResetDate: today
      }));
    }

    // 🔥 LOOP PER 50 + ANTI ERROR
    for(let i = 0; i < VIDEO_IDS.length; i += 50){

      const chunk = VIDEO_IDS.slice(i, i + 50);

      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${chunk.join(",")}&key=${API_KEY}`;

      const res = await fetch(url);
      const data = await res.json();

      data.items.forEach(video => {

        // 🔥 ANTI CRASH
        if(!video || !video.statistics || !video.snippet) return;

        const id = video.id;
        const views = Number(video.statistics.viewCount);

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
          category: category
        });

        history[id] = history[id].slice(-24);

      });

    }

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

      // 🔥 hasil daily kemarin
      let yesterdayTotals = {};

      if(fs.existsSync("daily.json")){
        yesterdayTotals =
          JSON.parse(fs.readFileSync("daily.json"));
      }

      // 🔥 tetap format lama
      Object.keys(data).forEach(id => {

  data[id].forEach(item => {

    item.total24h =
      yesterdayTotals[id] || 0;

  });

});

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
