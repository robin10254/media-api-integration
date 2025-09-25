import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import open from 'open';

// ----------------- CONFIG -----------------
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const TOKEN_PATH = 'token.json';
const VIDEO_ID = 'g05DWYZUPv4'; // <-- change to your video ID
const OUTPUT_FILE = 'media_data.json';
const POLLING_INTERVAL = 60 * 1000; // 60 seconds

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ----------------- MAIN -----------------
async function main() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    console.log('✅ Token loaded from file.');
    startPolling();
  } else {
    await getAccessToken(oAuth2Client);
  }
}

// ----------------- GET ACCESS TOKEN -----------------
async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  await open(authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from that page here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('✅ Token stored to', TOKEN_PATH);
      startPolling();
    } catch (err) {
      console.error('❌ Error retrieving access token', err);
    }
  });
}

// ----------------- POLLING -----------------
function startPolling() {
  console.log('⏱ Starting polling for new comments...');
  fetchMediaData(); // first fetch immediately
  setInterval(fetchMediaData, POLLING_INTERVAL); // repeat every interval
}

// ----------------- FETCH MEDIA DATA -----------------
async function fetchMediaData() {
  const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });

  try {
    // 1. Video details
    const videoRes = await youtube.videos.list({
      part: 'snippet,statistics',
      id: VIDEO_ID,
    });

    const video = videoRes.data.items[0];
    const videoData = {
      id: VIDEO_ID,
      title: video.snippet.title,
      description: video.snippet.description,
      publishedAt: video.snippet.publishedAt,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount,
    };

    // 2. Fetch comments + replies
    let comments = [];
    let nextPageToken = null;

    do {
      const response = await youtube.commentThreads.list({
        part: 'snippet,replies',
        videoId: VIDEO_ID,
        maxResults: 100,
        pageToken: nextPageToken,
      });

      response.data.items.forEach((item) => {
        const top = item.snippet.topLevelComment.snippet;
        const replies =
          item.replies?.comments?.map((r) => r.snippet.textDisplay) || [];

        comments.push({
          author: top.authorDisplayName,
          text: top.textDisplay,
          likeCount: top.likeCount,
          publishedAt: top.publishedAt,
          replies,
        });
      });

      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    // 3. Save structured data
    const mediaData = { video: videoData, comments };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mediaData, null, 2));
    console.log(`✅ Video + ${comments.length} comments fetched. Saved to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('❌ Error fetching media data:', err);
  }
}

// ----------------- RUN -----------------
main();
