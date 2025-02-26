const fs = require('fs').promises;
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const axios = require('axios');
const { Translator } = require('deepl-node');  // Import DeepL client
require('dotenv').config();

// Initialize the DeepL translator using the API key from .env
const translator = new Translator(process.env.DEEPL_API_KEY);

const sourceLanguageCode = 'JA'; // DeepL expects uppercase language codes
const targetLanguageCode = 'EN-US';
const URL = 'https://p.eagate.573.jp/game/ddr/ddrworld/info/index.html';

const API_HASHES_URL = process.env.BACKEND_API_URL_HASHES || 'http://your-backend-url.com/api/ddr-news/hashes'; 
const PUSH_NEWS_URL = process.env.BACKEND_API_URL || 'http://your-backend-url.com/api/ddr-news/update'; 
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

// Set batch size to avoid "request entity too large" errors
const BATCH_SIZE = 20;

/**
 * Generate a unique hash based on the news title and content.
 * Normalizes the text by trimming, converting to lowercase, and collapsing whitespace.
 */
function generateHash(title, content) {
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedContent = content.replace(/\s+/g, ' ').trim().toLowerCase();
    const combined = `${normalizedTitle} ${normalizedContent}`;
    return crypto.createHash('md5').update(combined).digest('hex');
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
 * Translate text using DeepL API (only for new items).
 */
async function translateText(text) {
    if (!text || text.trim() === '') return '';

    console.log(`🔄 Translating: ${text.substring(0, 30)}...`);
    try {
        // Use the translator instance to call DeepL's API
        const result = await translator.translateText(text, sourceLanguageCode, targetLanguageCode);
        return result.text;
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

    // Retrieve hashes for items already translated/processed
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
                title_en: '',  // Initially empty; will be filled if new
                date,
                content_jp: contentHTML.replace(/\s+/g, ' ').trim(),
                content_en: '', // Initially empty; will be filled if new
                images,
            };
        });
    });

    await browser.close();

    if (newsItems.length === 0) {
        console.warn('⚠ No news items found!');
        return;
    }

    // Filter only news items that are new (i.e. their hash doesn't exist in the backend)
    const newNewsItems = newsItems.filter(news => {
        // Generate hash using both title and content
        news.hash = generateHash(news.title_jp, news.content_jp);
        return !existingHashes.has(news.hash);
    });

    if (newNewsItems.length === 0) {
        console.log('✅ No new news items to add.');
        return;
    }

    console.log(`🆕 Found ${newNewsItems.length} new news items.`);

    // Translate only the new items (only if the translation fields are empty)
    if (translate) {
        for (const item of newNewsItems) {
            if (!item.title_en) {
                item.title_en = "[DDR World Latest News]";
            }
            if (!item.content_en) {
                item.content_en = await translateText(item.content_jp);
            }
        }
    }

    // Push new news items to the backend in batches
    console.log(`✅ Pushing ${newNewsItems.length} new news items to the backend in batches...`);
    for (let i = 0; i < newNewsItems.length; i += BATCH_SIZE) {
        const batch = newNewsItems.slice(i, i + BATCH_SIZE);
        try {
            await axios.post(PUSH_NEWS_URL, batch, {
                headers: {
                    "x-api-key": API_KEY,
                    "Content-Type": "application/json"
                }
            });
            console.log(`✅ Successfully pushed batch ${i / BATCH_SIZE + 1} (${batch.length} items).`);
        } catch (error) {
            console.error(`❌ Error pushing batch ${i / BATCH_SIZE + 1}:`, error.response ? error.response.data : error.message);
        }
    }
}

const shouldTranslate = process.argv.includes('--no-translate') ? false : true;
scrapeNews(shouldTranslate);
