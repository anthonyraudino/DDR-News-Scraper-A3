const fs = require('fs').promises;
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const axios = require('axios');
const { TranslationServiceClient } = require('@google-cloud/translate');
require('dotenv').config();

const translationClient = new TranslationServiceClient({ keyFilename: 'google-api.json' });

const sourceLanguageCode = 'ja';
const targetLanguageCode = 'en';
const URL = 'https://p.eagate.573.jp/game/ddr/ddrworld/info/index.html';

const API_HASHES_URL = process.env.BACKEND_API_URL_HASHES || 'http://your-backend-url.com/api/ddr-news/hashes'; 
const PUSH_NEWS_URL = process.env.BACKEND_API_URL || 'http://your-backend-url.com/api/ddr-news/update'; 
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

/**
 * Generate a unique hash based on the news content.
 */
function generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Fetch existing news hashes from the backend.
 */
async function fetchExistingNewsHashes() {
    try {
        console.log("🔄 Fetching existing news hashes from the backend...");
        const response = await axios.get(API_HASHES_URL, {
            headers: { "x-api-key": API_KEY }
        });

        const existingHashes = new Set(response.data.hashes);
        console.log(`✅ Retrieved ${existingHashes.size} existing news hashes.`);
        return existingHashes;
    } catch (error) {
        console.error("❌ Error fetching existing news hashes:", error.response ? error.response.data : error.message);
        return new Set(); // Return empty set if API request fails
    }
}

/**
 * Translate text using Google Translate API (only for new items).
 */
async function translateText(text) {
    if (!text || text.trim() === '') return '';

    console.log(`🔄 Translating: ${text.substring(0, 30)}...`);

    const request = {
        parent: `projects/otogemu/locations/global`,
        contents: [text],
        mimeType: 'text/plain',
        sourceLanguageCode,
        targetLanguageCode,
    };

    try {
        const [response] = await translationClient.translateText(request);
        return response.translations[0].translatedText;
    } catch (error) {
        console.error('❌ Error translating text:', error);
        return text;
    }
}

/**
 * Scrape DDR News page.
 */
async function scrapeNews(translate = true) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.news_one', { timeout: 10000 });

    const existingHashes = await fetchExistingNewsHashes();

    const newsItems = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.news_one')).map(news => {
            const title = news.querySelector('.title')?.innerText.trim() || 'DDR Update';
            const date = news.querySelector('.date')?.innerText.trim() || '';
            const contentHTML = news.querySelector('p')?.innerHTML || '';

            const images = [];
            news.querySelectorAll('.img_news_center img').forEach(img => {
                const imageUrl = img.getAttribute('data-src') || img.getAttribute('src');
                if (imageUrl) {
                    images.push(imageUrl.startsWith('http') ? imageUrl : `https://p.eagate.573.jp${imageUrl}`);
                }
            });

            return {
                title_jp: title,
                title_en: '',
                date,
                content_jp: contentHTML.replace(/\s+/g, ' ').trim(),
                content_en: '',
                images,
            };
        });
    });

    await browser.close();

    if (newsItems.length === 0) {
        console.warn('⚠ No news items found!');
        return;
    }

    const newNewsItems = [];
    for (const news of newsItems) {
        news.hash = generateHash(news.content_jp);

        if (!existingHashes.has(news.hash)) {
            newNewsItems.push(news);
        }
    }

    if (newNewsItems.length === 0) {
        console.log('✅ No new news items to add.');
        return;
    }

    console.log(`🆕 Found ${newNewsItems.length} new news items.`);

    if (translate) {
        for (const item of newNewsItems) {
            item.title_en = await translateText(item.title_jp);
            item.content_en = await translateText(item.content_jp);
        }
    }

    console.log(`✅ Pushing ${newNewsItems.length} new news items to the backend...`);

    try {
        await axios.post(PUSH_NEWS_URL, newNewsItems, {
            headers: {
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            }
        });

        console.log("✅ Successfully pushed new news items.");
    } catch (error) {
        console.error("❌ Error pushing news to backend:", error.response ? error.response.data : error.message);
    }
}

const shouldTranslate = process.argv.includes('--no-translate') ? false : true;
scrapeNews(shouldTranslate);