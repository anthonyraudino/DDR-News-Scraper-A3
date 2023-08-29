const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const { TranslationServiceClient } = require('@google-cloud/translate'); // Import TranslationServiceClient
const config = require('./config');
const path = require('path');

const striptags = require('striptags'); // Import the striptags library



// Google Cloud Translation API setup
const translationClient = new TranslationServiceClient({
  keyFilename: 'otogemu-f391650107ac.json',
});
const sourceLanguageCode = 'ja'; // Source language (Japanese)
const targetLanguageCode = 'en'; // Target language (English)

async function translateText(text) {
  const request = {
    parent: `projects/otogemu/locations/global`,
    contents: [text],
    mimeType: 'text/plain', // Use 'text/plain' instead of 'text/html'
    sourceLanguageCode,
    targetLanguageCode,
  };

  try {
    const [response] = await translationClient.translateText(request);
    const translation = response.translations[0].translatedText;
    return translation;
  } catch (error) {
    console.error('Error translating text:', error);
    return null;
  }
}

async function appendToJSON(newNewsItems) {
  try {
    const existingData = await fs.readFile('news.json', 'utf-8');
    const existingNewsItems = JSON.parse(existingData);

    // Identify new posts based on their unique properties (e.g., date)
    const newPosts = newNewsItems.filter(newItem => {
      return !existingNewsItems.some(existingItem => {
        return existingItem.date === newItem.date;
      });
    });

    // Append new posts to existing data
    existingNewsItems.push(...newPosts);

    // Write the updated data back to the file
    const updatedJsonData = JSON.stringify(existingNewsItems, null, 2);
    await fs.writeFile('news.json', updatedJsonData);

    console.log(`${newPosts.length} new posts appended to news.json`);
  } catch (error) {
    console.error('Error appending to JSON file:', error);
  }
}

// Function to generate the JSON data
async function generateJSON() {
  try {
    // Load existing data if available
    const existingData = await fs.readFile('news.json', 'utf-8');
    const existingNewsItems = JSON.parse(existingData);

    const response = await axios.get(URL);
    const $ = cheerio.load(response.data);

    const newsItems = [];
    const totalItems = $('.news_one').length;
    let processedItems = 0;

    for (const element of $('.news_one')) {
      const title = $(element).find('.title').text().trim();
      const date = $(element).find('.date').text().trim();
      //const contentHTML = $(element).find('p').html();
      const imageSrc = $(element).find('.img_news_center img').attr('src');
      const imageUrl = imageSrc ? `https://p.eagate.573.jp${imageSrc}` : '';

      const contentContainer = $(element).find('p');
      const contentNodes = contentContainer.contents(); // Get all child nodes

      const images = []; // Initialize an array to store images
      const contentParts = []; // Initialize an array to store text content and images

      // Extract multiple images from the post
      $(element).find('.img_news_center img').each((index, imgElement) => {
        const imageSrc = $(imgElement).attr('src');
        const imageUrl = imageSrc ? `https://p.eagate.573.jp${imageSrc}` : '';
        images.push(imageUrl);
      });

      contentNodes.each((index, node) => {
        if (node.type === 'tag' && node.name === 'img') {
          const imageSrc = $(node).attr('src');
          const imageUrl = imageSrc ? `https://p.eagate.573.jp${imageSrc}` : '';
          images.push(imageUrl);
        } else if (node.type === 'text') {
          const text = node.data.trim();
          if (text.length > 0) {
            const paragraphs = text.split(/\s*<\/?p>\s*/);
            const cleanedParagraphs = paragraphs.filter(paragraph => paragraph.length > 0);
            const formattedParagraphs = cleanedParagraphs.map(paragraph => {
              // Replace <br> tags with \n
              const formattedParagraph = paragraph.replace(/<br\s*\/?>/gi, '\n');
              return formattedParagraph;
            });
            contentParts.push(...formattedParagraphs.map(paragraph => ({ type: 'text', value: paragraph })));
          }
        }
      });
      
      const contentPlainText = contentParts.map(part => part.value).join('\n\n');
      
      const contentHTML = contentParts.map(part => {
        if (part.type === 'text') {
          return part.value.replace(/<\/?[^>]+(>|$)/g, ''); // Remove HTML tags
        } else {
          // For image parts, include the image HTML
          return `<img src="${part.value}" />`;
        }
      }).join('\n');      

      // Check if the item already exists in the existing data
      const existingItem = existingNewsItems.find(existingItem => existingItem.date === date);

      const newsItem = {
        title_jp: title, // Original Japanese title
        title_en: '', // Translated English title (initially empty)
        date,
        content_jp: contentHTML, // Original Japanese content
        content_en: '', // Translated English content (initially empty)
        imageUrl,
        images,
      };

      if (existingItem) {
        // If the item exists, use the existing translated content
        newsItem.title_en = existingItem.title_en;
        newsItem.content_en = existingItem.content_en;
        console.log(`Skipped ${processedItems} out of ${totalItems} items...`);
      } else {
        // If the item is new, perform translation
        const translatedTitle = await translateText(title);
        const translatedContent = await translateText(contentPlainText);

        newsItem.title_en = translatedTitle || title;
        newsItem.content_en = translatedContent || contentHTML;
        console.log(`Translated ${processedItems} out of ${totalItems} items...`);
      }

      newsItems.push(newsItem);
      processedItems++;
    }

    // Write the updated data back to the file
    const updatedJsonData = JSON.stringify(newsItems, null, 2);
    await fs.writeFile('news.json', updatedJsonData);

    console.log('News data has been scraped, translated, and saved to news.json');
  } catch (error) {
    console.error('Error:', error);
  }
}

const URL = 'https://p.eagate.573.jp/game/ddr/ddra3/p/info/index.html';

// Load existing JSON data and then call generateJSON
fs.readFile('news.json', 'utf-8')
  .then(existingData => {
    const existingNewsItems = JSON.parse(existingData);
    generateJSON(existingNewsItems);
  })
  .catch(error => {
    console.error('Error reading existing JSON file:', error);
  });


generateJSON()
  .catch(error => {
    console.error('Error:', error);
  });