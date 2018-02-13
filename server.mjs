/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import fs from 'fs';
import bodyParser from 'body-parser';
import url from 'url';
const URL = url.URL;
// import compression from 'compression';
// import minify from 'express-minify';
import express from 'express';
import firebasedAdmin from 'firebase-admin';
import puppeteer from 'puppeteer';

import Twitter from './public/twitter.mjs';
import * as feeds from './public/feeds.mjs';
import * as util from './public/util.mjs';
import * as dbHelper from './public/firebaseHelper.mjs';

const PORT = process.env.PORT || 8080;
const RENDER_CACHE = new Map(); // Cache of pre-rendered HTML pages.

const twitter = new Twitter('ChromiumDev');

/**
 *
 * @param url {string} URL to prerender.
 * @param onlyCriticalRequests {boolean} Reduces the number of requests the
 *     browser makes by aborting requests that are non-critical to rendering
 *     the DOM of the page (stylesheets, images, media). True by default.
 * @return {string} Serialized page output as an html string.
 */
async function ssr(url, onlyCriticalRequests = true) {
  if (RENDER_CACHE.has(url)) {
    return RENDER_CACHE.get(url);
  }

  // Add param so client-side page can know it's being rendered by headless on the server.
  const urlToFetch = new URL(url);
  urlToFetch.searchParams.set('headless', '');

  const tic = Date.now();
  const browser = await puppeteer.launch({
    args: ['--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();

  // Small optimization. Since we only care about rendered DOM, ignore images,
  // css, and other media that don't produce markup.
  if (onlyCriticalRequests) {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const whitelist = ['document', 'script', 'xhr', 'fetch', 'websocket'];
      if (whitelist.includes(req.resourceType())) {
        req.continue();
      } else {
        req.abort();
        // req.respond({
        //   status: 200,
        //   contentType: 'text/plain',
        //   body: ''
        // });
      }
    });
  }

  // TODO: another optimization may be to take enter page out of rendering pipeline.
  // Add html { display: none } to page.

  await page.goto(urlToFetch.href, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#posts'); // wait for posts to be in filled in page.
  const html = await page.content(); // Use browser to prerender page, get serialized DOM output!
  await browser.close();
  console.info(`Headless rendered page in: ${Date.now() - tic}ms`);

  RENDER_CACHE.set(url, html); // cache rendered page.

  return html;
}

dbHelper.setApp(firebasedAdmin.initializeApp({
  // credential: firebasedAdmin.credential.applicationDefault()
  credential: firebasedAdmin.credential.cert(
      JSON.parse(fs.readFileSync('./serviceAccountKey.json')))
}));

const app = express();

app.use(function forceSSL(req, res, next) {
  if (req.hostname !== 'localhost' && req.get('X-Forwarded-Proto') === 'http') {
    res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});

app.use(function addRequestHelpers(req, res, next) {
  req.getCurrentUrl = () => `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  req.getOrigin = () => `${req.protocol}://${req.get('host')}`;
  next();
});

// app.use(minify());
// app.use(compression()); // App Engine automtically gzips responses.
// app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static('public', {extensions: ['html', 'htm']}));
app.use(express.static('node_modules/lit-html'));
// app.use(express.static('node_modules/firebase'));
// app.use(function cors(req, res, next) {
//   res.header('Access-Control-Allow-Origin', '*');
//   // res.header('Content-Type', 'application/json;charset=utf-8');
//   // res.header('Cache-Control', 'public, max-age=300, s-maxage=600');
//   next();
// });

app.get('/ssr', async (req, res) => {
  const optimizeReqs = 'noreduce' in req.query ? false : true;
  const html = await ssr(req.getOrigin(), optimizeReqs);
  res.status(200).send(html);
});

app.get('/tweets/:username', async (req, res) => {
  const username = req.params.username;
  res.status(200).json(await twitter.getTweets(username));
});

app.get('/admin/update/feeds', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler can only be run from a GAE cron.');
  }
  res.status(200).json(await feeds.updateFeeds());
});

app.get('/admin/update/tweets/:username', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler can only be run from a GAE cron.');
  }
  const username = req.params.username;
  res.status(200).json(await twitter.updateTweets(username));
});

app.post('/posts', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  await dbHelper.newPost(req.body);
  res.status(200).send('Success!');
});

// app.delete('/posts/:year?/:month?/:idx?', async (req, res) => {
//   const year = req.params.year;r
//   const month = req.params.month.padStart(2, '0');
//   const itemsIdx = req.params.idx;
//   await db.deletePost(year, month, itemsIdx);
//   res.status(200).send('Success!');
// });

app.get('/posts/:year?/:month?/:day?', async (req, res) => {
  const year = req.params.year;
  // Pad values if missing leading '0'.
  const month = req.params.month ? req.params.month.padStart(2, '0') : null;
  const day = req.params.day ? req.params.day.padStart(2, '0') : null;
  const maxResults = req.query.maxresults ? Number(req.query.maxresults) : null;

  if (!year) {
    return res.status(400).send({error: 'No year specified.'});
  }

  const rssPosts = await feeds.collectRSSFeeds();
  const posts = await dbHelper.getPosts(year, month, day, rssPosts, maxResults);

  // TODO: monitor updates to other years. e.g. If the server is running when
  // a new year occurs, it will need to be restarted to pick up updates to that
  // new year.
  // Note: this setups a single realtime monitor (e.g. not one per request).
  dbHelper.monitorRealtimeUpdateToPosts(util.currentYear, async changes => {
    const url = req.getOrigin();
    RENDER_CACHE.delete(url);

    // Note: this is wasteful. We're proactively "precaching" the page again so
    // the next time it's requested, first load is fast. Otherwise, the user
    // that loads runs into the cache miss will a pef hit.
    await ssr(url);
  });

  res.status(200).send(posts);
});

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');

  // async function updatePosts(updateFunction, msTimeout) {
  //   await updateFunction.bind(twitter).call();
  //   setTimeout(updatePosts, msTimeout);
  // }

  // // Warm the caches.
  // // TODO: move to cron.
  // updatePosts(feeds.updateFeeds, 1000 * 60 * 60 * 24); // every 24hrs
  // updatePosts(twitter.updateTweets, 1000 * 60 * 60 * 1); // every 1hrs
});
