// index.js
import fs from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import open from 'open';

// ----------------- CONFIG -----------------
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const TOKEN_PATH = 'token.json';
// const CREDENTIALS_PATH = 'credentials.json';
const VIDEO_ID = 'g05DWYZUPv4'; // <-- change to your video ID
const COMMENTS_FILE = 'comments.json';

// ----------------- LOAD CREDENTIALS -----------------
// if (!fs.existsSync(CREDENTIALS_PATH)) {
//   console.error(`Error: ${CREDENTIALS_PATH} not found!`);
//   process.exit(1);
// }
// const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
// const { client_secret, client_id, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ----------------- AUTH & FETCH -----------------
async function main() {
  // Load token if exists
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    console.log('Token loaded from file.');
    await fetchComments();
  } else {
    await getAccessToken(oAuth2Client);
  }
}

// ----------------- GET ACCESS TOKEN -----------------
async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // to get refresh token
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
      console.log('Token stored to', TOKEN_PATH);
      await fetchComments();
    } catch (err) {
      console.error('Error retrieving access token', err);
    }
  });
}

// ----------------- FETCH COMMENTS -----------------
async function fetchComments() {
  const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });
  let allComments = [];
  let nextPageToken = null;

  try {
    do {
      const response = await youtube.commentThreads.list({
        part: 'snippet',
        videoId: VIDEO_ID,
        maxResults: 100,
        pageToken: nextPageToken,
      });

      response.data.items.forEach((item) => {
        allComments.push(item.snippet.topLevelComment.snippet.textDisplay);
      });

      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    // Save to JSON file
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(allComments, null, 2));
    console.log(`Fetched ${allComments.length} comments. Saved to ${COMMENTS_FILE}`);
  } catch (err) {
    console.error('Error fetching comments:', err);
  }
}

// ----------------- RUN -----------------
main();
