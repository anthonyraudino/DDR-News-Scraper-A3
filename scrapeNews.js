const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const URL = 'https://p.eagate.573.jp/game/ddr/ddra3/p/info/index.html';

axios.get(URL)
  .then(response => {
    const $ = cheerio.load(response.data);

    const newsItems = [];

    $('.news_one').each((index, element) => {
      const title = $(element).find('.title').text().trim();
      const date = $(element).find('.date').text().trim();
      const contentHTML = $(element).find('p').html(); // Get HTML including formatting
      const imageSrc = $(element).find('.img_news_center img').attr('src'); // Get image URL

      // Prepend base URL to imageSrc
      const imageUrl = imageSrc ? `https://p.eagate.573.jp${imageSrc}` : '';

      const newsItem = {
        title,
        date,
        contentHTML,
        imageUrl // Store modified image URL
      };

      newsItems.push(newsItem);
    });

    const jsonData = JSON.stringify(newsItems, null, 2);

    fs.writeFile('news.json', jsonData, err => {
      if (err) {
        console.error('Error writing JSON file:', err);
      } else {
        console.log('News data has been scraped and saved to news.json');
      }
    });
  })
  .catch(error => {
    console.error('Error fetching data:', error);
  });