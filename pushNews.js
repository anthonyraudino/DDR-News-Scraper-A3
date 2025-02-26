const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.BACKEND_API_URL || 'http://your-backend-url.com/api/ddr-news/update'; 
const API_HASHES_URL = process.env.BACKEND_API_URL_HASHES || 'http://your-backend-url.com/api/ddr-news/hashes'; 
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

const newsFilePath = path.join(__dirname, 'news.json');
const BATCH_SIZE = 50; // ✅ Send in batches to avoid large payload errors

async function loadNewsFile() {
    try {
        const data = await fs.promises.readFile(newsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading news.json:", error);
        return [];
    }
}

async function fetchExistingHashes() {
    try {
        const response = await axios.get(API_HASHES_URL, {
            headers: { "x-api-key": API_KEY }
        });
        return new Set(response.data.hashes);
    } catch (error) {
        console.error("Error fetching existing hashes:", error);
        return new Set(); // Return an empty set if the request fails
    }
}

async function pushNewsToBackend() {
    try {
        const newsData = await loadNewsFile();
        if (newsData.length === 0) {
            console.log("No news items to push.");
            return;
        }

        console.log("Fetching existing news hashes from the backend...");
        const existingHashes = await fetchExistingHashes();

        // **Filter only brand new news**
        const newNews = newsData.filter(item => !existingHashes.has(item.hash));

        if (newNews.length === 0) {
            console.log("No new news to push.");
            return;
        }

        console.log(`Pushing ${newNews.length} brand new news items in batches...`);

        for (let i = 0; i < newNews.length; i += BATCH_SIZE) {
            const batch = newNews.slice(i, i + BATCH_SIZE);

            try {
                const response = await axios.post(API_URL, batch, {
                    headers: {
                        "x-api-key": API_KEY,
                        "Content-Type": "application/json"
                    }
                });

                console.log(`✅ Successfully pushed batch ${i / BATCH_SIZE + 1}: ${response.data.message}`);
            } catch (error) {
                console.error(`❌ Error pushing batch ${i / BATCH_SIZE + 1}:`, error.response ? error.response.data : error.message);
            }
        }

        console.log("All new news items have been processed.");
    } catch (error) {
        console.error("Error pushing news to backend:", error);
    }
}

// Run the push function
pushNewsToBackend();