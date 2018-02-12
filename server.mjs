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

function updateRSSFeedsDaily() {
  console.info('Updating RSS feeds...');
  const dayInMilliseconds = 1000 * 60 * 60 * 24;
  const tick = Date.now();
  feeds.updateFeeds().then(() => {
    console.info(`feed update took ${(Date.now() - tick)/1000}s`);
  });
  setTimeout(updateRSSFeedsDaily, dayInMilliseconds);
}

async function ssr(url) {
  if (RENDER_CACHE.has(url)) {
    return RENDER_CACHE.get(url);
  }

  const tic = Date.now();
  const browser = await puppeteer.launch({
    args: ['--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#posts'); // wait for posts to be in filled in page.
  const html = await page.content(); // Browser "SSR" page for us! Get serialized DOM.
  await browser.close();
  console.info(`Headless chrome render time: ${Date.now() - tic}ms`);

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
  const html = await ssr(req.getOrigin());
  res.status(200).send(html);
});

app.get('/tweets/:username', async (req, res) => {
  const username = req.params.username;
  const twitter = new Twitter();
  res.status(200).json(await twitter.getTweets(username));
});

app.get('/admin/_updaterss', async (req, res) => {
  res.status(200).json(await feeds.updateFeeds());
});

app.get('/admin/_updatetweets', async (req, res) => {
  const username = req.params.username;
  const twitter = new Twitter();
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
  updateRSSFeedsDaily();
});