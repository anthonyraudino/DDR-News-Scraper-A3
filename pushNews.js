const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.BACKEND_API_URL || 'http://your-backend-url.com/api/ddr-news/update'; 
const API_KEY = process.env.API_KEY || 'your-api-key'; 

// Load news.json file
const newsFilePath = path.join(__dirname, 'news.json');

async function loadNewsFile() {
    try {
        const data = await fs.promises.readFile(newsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading news.json:", error);
        return [];
    }
}

async function pushNewsToBackend() {
    try {
        const newsData = await loadNewsFile();

        if (newsData.length === 0) {
            console.log("No news items to push.");
            return;
        }

        console.log(`Pushing ${newsData.length} news items to backend...`);

        const response = await axios.post(API_URL, newsData, {
            headers: {
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            }
        });

        console.log(`Successfully pushed news: ${response.data.message}`);
    } catch (error) {
        console.error("Error pushing news to backend:", error.response ? error.response.data : error.message);
    }
}

// Run the push function
pushNewsToBackend();