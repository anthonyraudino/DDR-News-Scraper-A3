const fs = require('fs').promises;
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const { TranslationServiceClient } = require('@google-cloud/translate');

const translationClient = new TranslationServiceClient({ keyFilename: 'google-api.json' });
const sourceLanguageCode = 'ja';
const targetLanguageCode = 'en';
const URL = 'https://p.eagate.573.jp/game/ddr/ddrworld/info/index.html';

/**
 * Generate a unique hash based on the news content.
 */
function generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Load existing news items.
 */
async function loadExistingNews() {
    try {
        const data = await fs.readFile('news.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.warn('No existing news.json file found. Creating a new one.');
        return [];
    }
}

/**
 * Translate text using Google Translate API.
 */
async function translateText(text) {
    if (!text || text.trim() === '') return '';
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
        console.error('Error translating text:', error);
        return text;
    }
}

/**
 * Scrape DDR News page.
 */
async function scrapeNews(translate = true) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.news_one', { timeout: 10000 });

    const existingNews = await loadExistingNews();

    // Extract news items without hashing inside page.evaluate()
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
        console.warn('No news items found!');
    }

    // Generate hashes in the Node.js environment
    newsItems.forEach(news => {
        news.hash = generateHash(news.content_jp);
    });

    if (translate) {
        for (const item of newsItems) {
            item.title_en = await translateText(item.title_jp);
            item.content_en = await translateText(item.content_jp);
        }
    }

    // Filter out duplicates based on hash
    const newNewsItems = newsItems.filter(news => 
        !existingNews.some(existing => existing.hash === news.hash)
    );

    if (newNewsItems.length > 0) {
        const updatedNews = [...newNewsItems, ...existingNews];
        await fs.writeFile('news.json', JSON.stringify(updatedNews, null, 2));
        console.log(`Added ${newNewsItems.length} new news items.`);
    } else {
        console.log('No new news items to add.');
    }
}

const shouldTranslate = process.argv.includes('--no-translate') ? false : true;
scrapeNews(shouldTranslate);
